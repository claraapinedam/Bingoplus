'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { apiFetch, apiFetchPage, ApiError } from '@/lib/api';

interface Rider {
  id: string;
  accountStatus: string;
  availabilityStatus: string;
  city: string | null;
  ratingAvg: number;
  deliveriesCompleted: number;
  user: { firstName: string; lastName: string; email: string; phone: string | null };
  vehicles: { type: string }[];
}

const LIVE_STATUSES = ['ACTIVE', 'SUSPENDED', 'INACTIVE'];

// FASE 4: account approval status and operational availability are two separate fields now
// (Rider.accountStatus / Rider.availabilityStatus) — a rider can be ACTIVE+OFFLINE, previously
// inexpressible when both lived in one combined enum. These tabs filter by accountStatus only
// (what /admin/riders?status= actually accepts); availabilityStatus is shown per-row instead.
const STATUS_TABS = [
  { value: '', label: 'Todos' },
  { value: 'ACTIVE', label: 'Activos' },
  { value: 'SUSPENDED', label: 'Suspendidos' },
  { value: 'INACTIVE', label: 'Inactivos' },
];

export default function RidersPage() {
  const [status, setStatus] = useState('');
  const [riders, setRiders] = useState<Rider[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      if (status) {
        const result = await apiFetchPage<Rider>(`/admin/riders?status=${status}&pageSize=100`);
        setRiders(result.data);
        setTotal(result.meta.total);
      } else {
        const result = await apiFetchPage<Rider>(`/admin/riders?pageSize=200`);
        const filtered = result.data.filter((r) => LIVE_STATUSES.includes(r.accountStatus));
        setRiders(filtered);
        setTotal(filtered.length);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar la lista de riders.');
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(id: string, action: 'reactivate' | 'suspend' | 'activate') {
    setActingOn(id);
    try {
      if (action === 'activate') {
        await apiFetch(`/admin/riders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'ACTIVE' }) });
      } else {
        await apiFetch(`/admin/riders/${id}/${action}`, { method: 'PATCH', body: JSON.stringify({}) });
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'La acción falló.');
    } finally {
      setActingOn(null);
    }
  }

  return (
    <AdminShell>
      <h1 className="bingo-page-title">Riders</h1>
      <p className="bingo-page-subtitle">
        {total} rider(s) con cuenta activa, suspendida o inactiva. Elige un rider para ver sus entregas.
      </p>

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
        {riders === null ? (
          <p>Cargando…</p>
        ) : riders.length === 0 ? (
          <p>No hay riders en este estado.</p>
        ) : (
          <table className="bingo-table">
            <thead>
              <tr>
                <th>Rider</th>
                <th>Ciudad</th>
                <th>Vehículo</th>
                <th>Rating</th>
                <th>Entregas</th>
                <th>Cuenta</th>
                <th>Disponibilidad</th>
                <th>Contacto</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {riders.map((r) => (
                <tr key={r.id}>
                  <td>
                    <a href={`/riders/${r.id}`}>
                      {r.user.firstName} {r.user.lastName}
                    </a>
                  </td>
                  <td>{r.city ?? '—'}</td>
                  <td>{r.vehicles[0]?.type ?? '—'}</td>
                  <td>{r.ratingAvg.toFixed(1)}</td>
                  <td>{r.deliveriesCompleted}</td>
                  <td>
                    <span className={`bingo-badge badge-${r.accountStatus.toLowerCase()}`}>{r.accountStatus}</span>
                  </td>
                  <td>
                    <span className={`bingo-badge badge-${r.availabilityStatus.toLowerCase()}`}>{r.availabilityStatus}</span>
                  </td>
                  <td>
                    {r.user.email}
                    <br />
                    {r.user.phone}
                  </td>
                  <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <a href={`/riders/${r.id}`} className="bingo-button secondary">
                      Ver
                    </a>
                    {r.accountStatus === 'SUSPENDED' && (
                      <button
                        className="bingo-button"
                        disabled={actingOn === r.id}
                        onClick={() => runAction(r.id, 'reactivate')}
                      >
                        Reactivar
                      </button>
                    )}
                    {r.accountStatus === 'INACTIVE' && (
                      <button
                        className="bingo-button"
                        disabled={actingOn === r.id}
                        onClick={() => runAction(r.id, 'activate')}
                      >
                        Reactivar
                      </button>
                    )}
                    {r.accountStatus === 'ACTIVE' && (
                      <button
                        className="bingo-button danger"
                        disabled={actingOn === r.id}
                        onClick={() => runAction(r.id, 'suspend')}
                      >
                        Suspender
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminShell>
  );
}
