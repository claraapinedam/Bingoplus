'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminShell from '@/components/AdminShell';
import { apiFetch, ApiError } from '@/lib/api';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

interface OrderItem {
  id: string;
  nameSnapshot: string;
  quantity: number;
  unitPrice: string | number;
  subtotal: string | number;
}

interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  fulfillmentType: 'PICKUP' | 'DELIVERY';
  subtotal: string | number;
  discount: string | number;
  tax: string | number;
  total: string | number;
  createdAt: string;
  updatedAt: string;
  cancelReason: string | null;
  items: OrderItem[];
  business: { id: string; tradeName: string; city: string };
  user: { firstName: string; lastName: string };
  payment: { id: string; status: string; amount: string | number } | null;
  delivery: {
    id: string;
    status: string;
    estimatedDurationMinutes: number | null;
    rider: { user: { firstName: string; lastName: string } } | null;
  } | null;
}

export default function AdminOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setOrder(await apiFetch<OrderDetail>(`/admin/orders/${params.id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar el pedido.');
      setOrder(null);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (order === undefined) {
    return (
      <AdminShell>
        <p>Cargando…</p>
      </AdminShell>
    );
  }
  if (!order) {
    return (
      <AdminShell>
        <div className="bingo-card" style={{ color: 'var(--bingo-error)' }}>{error ?? 'Pedido no encontrado.'}</div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <button className="bingo-button secondary" style={{ marginBottom: 16, padding: '8px 14px', fontSize: 13 }} onClick={() => router.back()}>
        ← Volver
      </button>

      <h1 className="bingo-page-title">{order.orderNumber}</h1>
      <p className="bingo-page-subtitle">
        {order.user.firstName} {order.user.lastName} · {order.business.tradeName} ·{' '}
        <span className={`bingo-badge badge-${order.status.toLowerCase()}`}>{order.status}</span>
      </p>

      {order.cancelReason && (
        <div className="bingo-card" style={{ marginBottom: 16, color: 'var(--bingo-error)' }}>
          Cancelado: {order.cancelReason}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="bingo-card">
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>Productos</h2>
          {order.items.map((item) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span>
                {item.quantity}× {item.nameSnapshot}
              </span>
              <span>{currencyFormatter.format(Number(item.subtotal))}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, marginTop: 10, paddingTop: 10, borderTop: '1px solid #eef1f5' }}>
            <span>Total</span>
            <span>{currencyFormatter.format(Number(order.total))}</span>
          </div>
        </div>

        <div className="bingo-card">
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>Pago</h2>
          {order.payment ? (
            <>
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                Estado: <span className={`bingo-badge badge-${order.payment.status.toLowerCase()}`}>{order.payment.status}</span>
              </div>
              <div style={{ fontSize: 13, marginBottom: 12 }}>Monto: {currencyFormatter.format(Number(order.payment.amount))}</div>
              <a href={`/payments/${order.payment.id}`} className="bingo-button secondary" style={{ padding: '8px 14px', fontSize: 13 }}>
                Ver pago / reembolsar
              </a>
            </>
          ) : (
            <p style={{ fontSize: 13, color: '#7f8ea3' }}>Sin pago registrado.</p>
          )}
        </div>

        <div className="bingo-card" style={{ gridColumn: 'span 2' }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>
            {order.fulfillmentType === 'PICKUP' ? 'Retiro en tienda' : 'Delivery'}
          </h2>
          {order.fulfillmentType === 'PICKUP' ? (
            <p style={{ fontSize: 13, color: '#7f8ea3' }}>El cliente retira en {order.business.tradeName}, {order.business.city}.</p>
          ) : order.delivery ? (
            <>
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                Estado: <span className={`bingo-badge badge-${order.delivery.status.toLowerCase()}`}>{order.delivery.status}</span>
              </div>
              {order.delivery.rider && (
                <div style={{ fontSize: 13, marginBottom: 6 }}>
                  Rider: {order.delivery.rider.user.firstName} {order.delivery.rider.user.lastName}
                </div>
              )}
              {order.delivery.estimatedDurationMinutes != null && (
                <div style={{ fontSize: 13, marginBottom: 12 }}>ETA: ~{order.delivery.estimatedDurationMinutes} min</div>
              )}
              <a href={`/deliveries/${order.delivery.id}`} className="bingo-button secondary" style={{ padding: '8px 14px', fontSize: 13 }}>
                Ver entrega
              </a>
            </>
          ) : (
            <p style={{ fontSize: 13, color: '#7f8ea3' }}>Todavía no se ha creado la entrega para este pedido.</p>
          )}
        </div>

        <div className="bingo-card" style={{ gridColumn: 'span 2', fontSize: 12, color: '#9aa5b1' }}>
          Creado: {new Date(order.createdAt).toLocaleString('es-EC')} · Actualizado: {new Date(order.updatedAt).toLocaleString('es-EC')}
        </div>
      </div>
    </AdminShell>
  );
}
