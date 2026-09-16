'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
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
  const [deliveries, setDeliveries] = useState<DeliveryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const query = status ? `?status=${status}` : '';
      setDeliveries(await apiFetch<DeliveryRow[]>(`/admin/deliveries${query}`));
    } catch {
      setError('No se pudo cargar la lista de entregas.');
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AdminShell>
      <h1 className="bingo-page-title">Delivery</h1>
      <p className="bingo-page-subtitle">Supervisión global de entregas — no reconstruye el backend de tracking, solo lo consume.</p>

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
