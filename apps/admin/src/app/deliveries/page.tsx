'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import DateRangeFilter, { DateRangeFilterValue } from '@/components/DateRangeFilter';
import { apiFetch } from '@/lib/api';

interface DeliveryRow {
  id: string;
  status: string;
  estimatedDurationMinutes: number | null;
  createdAt: string;
  order: { orderNumber: string; business: { tradeName: string }; user: { firstName: string; lastName: string } };
  rider: { user: { firstName: string; lastName: string } } | null;
}

const STATUS_TABS = [
  { value: '', label: 'Todas' },
  { value: 'SEARCHING_RIDER', label: 'Buscando rider' },
  { value: 'RIDER_ASSIGNED', label: 'Asignadas' },
  { value: 'GOING_TO_PICKUP', label: 'En camino a negocio' },
  { value: 'PICKED_UP', label: 'Recogido' },
  { value: 'IN_TRANSIT', label: 'En camino' },
  { value: 'DELIVERED', label: 'Entregadas' },
  { value: 'FAILED', label: 'Fallidas' },
  { value: 'CANCELLED', label: 'Canceladas' },
];

export default function AdminDeliveriesPage() {
  const [status, setStatus] = useState('');
  const [range, setRange] = useState<DateRangeFilterValue>({});
  const [deliveries, setDeliveries] = useState<DeliveryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (range.from) params.set('from', range.from);
      if (range.to) params.set('to', range.to);
      const qs = params.toString();
      setDeliveries(await apiFetch<DeliveryRow[]>(`/admin/deliveries${qs ? `?${qs}` : ''}`));
    } catch {
      setError('No se pudo cargar la lista de entregas.');
    }
  }, [status, range]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AdminShell>
      <h1 className="bingo-page-title" style={{ marginBottom: 24 }}>Delivery</h1>

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

      <DateRangeFilter value={range} onChange={setRange} allowAll />

      {error && (
        <div className="bingo-card" style={{ marginBottom: 16, color: 'var(--bingo-error)' }}>
          {error}
        </div>
      )}

      <div className="bingo-card">
        {deliveries === null ? (
          <p>Cargando…</p>
        ) : deliveries.length === 0 ? (
          <p>No hay entregas en este estado.</p>
        ) : (
          <table className="bingo-table">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Negocio</th>
                <th>Rider</th>
                <th>ETA</th>
                <th>Estado</th>
                <th>Creado</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d.id} onClick={() => (window.location.href = `/deliveries/${d.id}`)} style={{ cursor: 'pointer' }}>
                  <td>{d.order.orderNumber}</td>
                  <td>
                    {d.order.user.firstName} {d.order.user.lastName}
                  </td>
                  <td>{d.order.business.tradeName}</td>
                  <td>{d.rider ? `${d.rider.user.firstName} ${d.rider.user.lastName}` : 'Sin asignar'}</td>
                  <td>{d.estimatedDurationMinutes != null ? `~${d.estimatedDurationMinutes} min` : '—'}</td>
                  <td>
                    <span className={`bingo-badge badge-${d.status.toLowerCase()}`}>{d.status}</span>
                  </td>
                  <td style={{ fontSize: 12 }}>{new Date(d.createdAt).toLocaleString('es-EC')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminShell>
  );
}
