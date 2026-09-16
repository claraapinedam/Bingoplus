'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

interface DeliveryRow {
  id: string;
  status: string;
  deliveryFee: string | number;
  createdAt: string;
  deliveredAt: string | null;
  order: { orderNumber: string; business: { tradeName: string } };
  rider: { user: { firstName: string; lastName: string } } | null;
}

const STATUS_TABS = [
  { value: '', label: 'Todas' },
  { value: 'DELIVERED', label: 'Entregadas' },
  { value: 'IN_TRANSIT', label: 'En camino' },
  { value: 'CANCELLED', label: 'Canceladas' },
  { value: 'FAILED', label: 'Fallidas' },
];

export default function CustomerDeliveriesTab({ userId }: { userId: string }) {
  const [status, setStatus] = useState('');
  const [deliveries, setDeliveries] = useState<DeliveryRow[] | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ userId });
    if (status) params.set('status', status);
    const rows = await apiFetch<DeliveryRow[]>(`/admin/deliveries?${params}`);
    setDeliveries(rows);
  }, [userId, status]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <p style={{ fontSize: 13, color: '#7f8ea3', marginBottom: 14 }}>{deliveries?.length ?? '—'} entrega(s) de este cliente.</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {STATUS_TABS.map((t) => (
          <button key={t.value} onClick={() => setStatus(t.value)} className={`bingo-button ${status === t.value ? '' : 'secondary'}`} style={{ padding: '8px 14px', fontSize: 13 }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bingo-card">
        {deliveries === null ? (
          <p>Cargando…</p>
        ) : deliveries.length === 0 ? (
          <p>Este cliente no tiene entregas en este filtro.</p>
        ) : (
          <table className="bingo-table">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Negocio</th>
                <th>Rider</th>
                <th>Tarifa de delivery</th>
                <th>Estado</th>
                <th>Entregado</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d.id} onClick={() => (window.location.href = `/deliveries/${d.id}`)} style={{ cursor: 'pointer' }}>
                  <td>{d.order.orderNumber}</td>
                  <td>{d.order.business.tradeName}</td>
                  <td>{d.rider ? `${d.rider.user.firstName} ${d.rider.user.lastName}` : 'Sin asignar'}</td>
                  <td>{currencyFormatter.format(Number(d.deliveryFee))}</td>
                  <td>
                    <span className={`bingo-badge badge-${d.status.toLowerCase()}`}>{d.status}</span>
                  </td>
                  <td style={{ fontSize: 12 }}>{d.deliveredAt ? new Date(d.deliveredAt).toLocaleString('es-EC') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
