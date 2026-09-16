'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { apiFetch, apiFetchPage, ApiError } from '@/lib/api';

interface Rider {
  id: string;
  accountStatus: string;
  city: string | null;
  createdAt: string;
  user: { firstName: string; lastName: string; email: string; phone: string | null };
  vehicles: { type: string }[];
}

const NOT_YET_LIVE = ['PENDING_APPROVAL', 'REJECTED'];

const STATUS_TABS = [
  { value: '', label: 'Todas' },
  { value: 'PENDING_APPROVAL', label: 'Pendientes' },
  { value: 'REJECTED', label: 'Rechazadas' },
];

export default function RiderRequestsPage() {
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
        const filtered = result.data.filter((r) => NOT_YET_LIVE.includes(r.accountStatus));
        setRiders(filtered);
        setTotal(filtered.length);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar las solicitudes.');
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  async function approve(id: string) {
    setActingOn(id);
    try {
      await apiFetch(`/admin/riders/${id}/approve`, { method: 'PATCH', body: JSON.stringify({}) });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'La acción falló.');
    } finally {
      setActingOn(null);
    }
  }

  async function reject(id: string) {
    setActingOn(id);
    try {
      await apiFetch(`/admin/riders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'REJECTED' }) });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'La acción falló.');
    } finally {
      setActingOn(null);
    }
  }

  return (
    <AdminShell>
      <h1 className="bingo-page-title">Solicitudes de Riders</h1>
      <p className="bingo-page-subtitle">
        {total} solicitud(es). Al aprobar, el rider deja de aparecer aquí y pasa a Riders como cuenta activa.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {STATUS_TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setStatus(t.value)}
            className={`bingo-button ${status === t.value ? '' : 'secondary'}`}
            style={{ padding: '8px 14px', fontSize: 13 }}
          >
            {t.label}
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
          <p>No hay solicitudes en este filtro.</p>
        ) : (
          <table className="bingo-table">
            <thead>
              <tr>
                <th>Rider</th>
                <th>Ciudad</th>
                <th>Vehículo</th>
                <th>Estado</th>
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
                  <td>
                    <span className={`bingo-badge badge-${r.accountStatus.toLowerCase()}`}>{r.accountStatus}</span>
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
                    {r.accountStatus === 'PENDING_APPROVAL' && (
                      <>
                        <button className="bingo-button" disabled={actingOn === r.id} onClick={() => approve(r.id)}>
                          Aprobar
                        </button>
                        <button className="bingo-button danger" disabled={actingOn === r.id} onClick={() => reject(r.id)}>
                          Rechazar
                        </button>
                      </>
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
