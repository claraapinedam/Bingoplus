'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';
import EmptyState from '@/components/EmptyState';
import MapView from '@/components/MapView';
import { apiFetch, ApiError, getActiveBusinessId } from '@/lib/api';
import { connectSocket } from '@/lib/socket';
import {
  API_ERROR_MESSAGES,
  DELIVERY_STATUS_LABELS,
  getOrderNextAction,
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
} from '@/lib/orderStatus';

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
  platformFee: string | number;
  serviceFee: string | number;
  deliveryFee: string | number;
  total: string | number;
  currency: string;
  notes: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  user: { firstName: string; lastName: string };
  payment: { status: string } | null;
  deliveryAddressSnapshot: { label: string; line1: string; line2: string | null; city: string } | null;
}

interface DeliveryInfo {
  id: string;
  status: string;
  estimatedDistanceKm: number | null;
  estimatedDurationMinutes: number | null;
  rider: { user: { firstName: string; lastName: string } } | null;
  pickupAddressSnapshot: { tradeName?: string; latitude?: number | null; longitude?: number | null } | null;
  deliveryAddressSnapshot: { label?: string; latitude?: number | null; longitude?: number | null } | null;
  route: { polyline: string } | null;
}

export default function BusinessOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const businessId = getActiveBusinessId();
  const [order, setOrder] = useState<OrderDetail | null | undefined>(undefined);
  const [delivery, setDelivery] = useState<DeliveryInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!businessId) return;
    apiFetch<OrderDetail>(`/me/business/${businessId}/orders/${params.id}`)
      .then(setOrder)
      .catch(() => setOrder(null));
    apiFetch<DeliveryInfo | null>(`/me/business/${businessId}/orders/${params.id}/delivery`)
      .then(setDelivery)
      .catch(() => setDelivery(null));
  }, [businessId, params.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Once a Delivery exists, its progress pushes live over the existing delivery:{id} room — the
  // gateway was widened (FASE 4C) to also authorize the owning business, same room/events Rider
  // and Customer already use, no new infrastructure.
  useEffect(() => {
    const socket = connectSocket();
    if (!socket || !delivery?.id) return;
    socket.emit('subscribe:delivery', { deliveryId: delivery.id });
    const onUpdate = () => load();
    socket.on('delivery.status.updated', onUpdate);
    socket.on('delivery.rider.assigned', onUpdate);
    socket.on('delivery.completed', onUpdate);
    return () => {
      socket.emit('unsubscribe:delivery', { deliveryId: delivery.id });
      socket.off('delivery.status.updated', onUpdate);
      socket.off('delivery.rider.assigned', onUpdate);
      socket.off('delivery.completed', onUpdate);
    };
  }, [delivery?.id, load]);

  async function runAction() {
    if (!order || !businessId) return;
    const next = getOrderNextAction(order.status, order.fulfillmentType);
    if (!next) return;
    setBusy(true);
    setError(null);
    try {
      if (next.useReadyForPickupEndpoint) {
        await apiFetch(`/me/business/${businessId}/orders/${order.id}/ready-for-pickup`, { method: 'POST' });
      } else {
        await apiFetch(`/me/business/${businessId}/orders/${order.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: next.targetStatus }),
        });
      }
      load();
    } catch (err) {
      setError(err instanceof ApiError ? (API_ERROR_MESSAGES[err.code] ?? err.message) : 'No se pudo actualizar el pedido.');
    } finally {
      setBusy(false);
    }
  }

  if (order === undefined) {
    return (
      <DashboardShell>
        <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
      </DashboardShell>
    );
  }
  if (!order) {
    return (
      <DashboardShell>
        <EmptyState title="Pedido no disponible" />
      </DashboardShell>
    );
  }

  const nextAction = getOrderNextAction(order.status, order.fulfillmentType);

  return (
    <DashboardShell>
      <button className="bingo-button secondary small" style={{ marginBottom: 16, width: 'auto' }} onClick={() => router.push('/orders')}>
        ← Pedidos
      </button>
      <header className="dashboard-page-header">
        <div>
          <div className="dashboard-page-title">{order.orderNumber}</div>
          <div className="dashboard-page-subtitle">
            {order.user.firstName} {order.user.lastName}
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 640 }}>
        <span
          className="bingo-badge"
          style={{ background: '#f2f4f7', color: ORDER_STATUS_COLORS[order.status] ?? '#54617a', fontSize: 13 }}
        >
          {ORDER_STATUS_LABELS[order.status] ?? order.status}
        </span>
        {order.cancelReason && (
          <div className="bingo-error-banner" style={{ marginTop: 10 }}>
            Cancelado: {order.cancelReason}
          </div>
        )}

        <h2 className="bingo-section-title">Productos</h2>
        <div className="bingo-card">
          {order.items.map((item) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span>
                {item.quantity}× {item.nameSnapshot}
              </span>
              <span>{currencyFormatter.format(Number(item.subtotal))}</span>
            </div>
          ))}
        </div>

        <h2 className="bingo-section-title">
          {order.fulfillmentType === 'PICKUP' ? 'Retiro en tienda' : 'Entrega a domicilio'}
        </h2>
        <div className="bingo-card" style={{ fontSize: 13 }}>
          {order.fulfillmentType === 'PICKUP' ? (
            'El cliente retira en la tienda.'
          ) : order.deliveryAddressSnapshot ? (
            <>
              {order.deliveryAddressSnapshot.label} — {order.deliveryAddressSnapshot.line1}
              {order.deliveryAddressSnapshot.line2 ? `, ${order.deliveryAddressSnapshot.line2}` : ''},{' '}
              {order.deliveryAddressSnapshot.city}
            </>
          ) : (
            'Sin dirección registrada'
          )}
        </div>

        {delivery && (
          <div className="bingo-card" style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{DELIVERY_STATUS_LABELS[delivery.status] ?? delivery.status}</div>
            {delivery.rider && (
              <div style={{ fontSize: 12, marginTop: 4 }}>
                Repartidor: {delivery.rider.user.firstName} {delivery.rider.user.lastName}
              </div>
            )}
            {delivery.estimatedDurationMinutes != null && (
              <div style={{ fontSize: 11, color: '#7f8ea3', marginTop: 4 }}>ETA ~{delivery.estimatedDurationMinutes} min</div>
            )}
            <div style={{ marginTop: 10 }}>
              <MapView
                pickup={
                  delivery.pickupAddressSnapshot?.latitude != null && delivery.pickupAddressSnapshot.longitude != null
                    ? { lat: delivery.pickupAddressSnapshot.latitude, lng: delivery.pickupAddressSnapshot.longitude, label: delivery.pickupAddressSnapshot.tradeName }
                    : null
                }
                destination={
                  delivery.deliveryAddressSnapshot?.latitude != null && delivery.deliveryAddressSnapshot.longitude != null
                    ? { lat: delivery.deliveryAddressSnapshot.latitude, lng: delivery.deliveryAddressSnapshot.longitude, label: 'Cliente' }
                    : null
                }
                routePolyline={delivery.route?.polyline ?? null}
                height={200}
              />
            </div>
          </div>
        )}

        <h2 className="bingo-section-title">Resumen</h2>
        <div className="bingo-card">
          {[
            ['Subtotal', Number(order.subtotal)],
            ['Descuento', -Number(order.discount)],
            ['Impuestos', Number(order.tax)],
            ['Tarifa de servicio', Number(order.platformFee) + Number(order.serviceFee)],
            ['Envío', Number(order.deliveryFee)],
          ].map(([label, value]) => (
            <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#54617a' }}>
              <span>{label}</span>
              <span>{currencyFormatter.format(value as number)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, marginTop: 8 }}>
            <span>Total</span>
            <span>{currencyFormatter.format(Number(order.total))}</span>
          </div>
          {order.payment && (
            <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 8 }}>
              Pago: {order.payment.status === 'PAID' ? 'Pagado' : order.payment.status}
            </div>
          )}
        </div>

        <div className="bingo-card" style={{ marginTop: 12, fontSize: 12, color: '#9aa5b1' }}>
          Creado: {new Date(order.createdAt).toLocaleString('es-EC')}
          <br />
          Actualizado: {new Date(order.updatedAt).toLocaleString('es-EC')}
        </div>

        {error && <div className="bingo-error-banner" style={{ marginTop: 12 }}>{error}</div>}

        {nextAction && (
          <button className="bingo-button business-action-button" style={{ marginTop: 16 }} disabled={busy} onClick={runAction}>
            {busy ? 'Procesando…' : nextAction.label}
          </button>
        )}
      </div>
    </DashboardShell>
  );
}
