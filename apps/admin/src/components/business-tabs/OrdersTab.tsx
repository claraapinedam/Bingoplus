'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetchPage } from '@/lib/api';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

interface OrderRow {
  id: string;
  orderNumber: string;
  status: string;
  fulfillmentType: 'PICKUP' | 'DELIVERY';
  total: string | number;
  createdAt: string;
  user: { firstName: string; lastName: string };
  payment: { status: string } | null;
}

const STATUS_TABS = [
  { value: '', label: 'Todos' },
  { value: 'PAID', label: 'Pagados' },
  { value: 'CONFIRMED', label: 'Confirmados' },
  { value: 'PREPARING', label: 'Preparando' },
  { value: 'READY_FOR_PICKUP', label: 'Listos' },
  { value: 'COMPLETED', label: 'Completados' },
  { value: 'CANCELLED', label: 'Cancelados' },
];

export default function OrdersTab({ businessId }: { businessId: string }) {
  const [status, setStatus] = useState('');
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ pageSize: '50', businessId });
    if (status) params.set('status', status);
    const result = await apiFetchPage<OrderRow>(`/admin/orders?${params}`);
    setOrders(result.data);
    setTotal(result.meta.total);
  }, [businessId, status]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <p style={{ fontSize: 13, color: '#7f8ea3', marginBottom: 14 }}>{total} pedido(s) de este negocio.</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatus(tab.value)}
            className={`bingo-button ${status === tab.value ? '' : 'secondary'}`}
            style={{ padding: '8px 14px', fontSize: 13 }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bingo-card">
        {orders === null ? (
          <p>Cargando…</p>
        ) : orders.length === 0 ? (
          <p>Este negocio no tiene pedidos en este filtro.</p>
        ) : (
          <table className="bingo-table">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Total</th>
                <th>Pago</th>
                <th>Estado</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} onClick={() => (window.location.href = `/orders/${o.id}`)} style={{ cursor: 'pointer' }}>
                  <td>{o.orderNumber}</td>
                  <td>
                    {o.user.firstName} {o.user.lastName}
                  </td>
                  <td>{o.fulfillmentType === 'PICKUP' ? 'Retiro' : 'Entrega'}</td>
                  <td>{currencyFormatter.format(Number(o.total))}</td>
                  <td>
                    {o.payment ? (
                      <span className={`bingo-badge badge-${o.payment.status.toLowerCase()}`}>{o.payment.status}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <span className={`bingo-badge badge-${o.status.toLowerCase()}`}>{o.status}</span>
                  </td>
                  <td style={{ fontSize: 12 }}>{new Date(o.createdAt).toLocaleString('es-EC')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
