'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import RatingCell from '@/components/RatingCell';
import IconButton from '@/components/IconButton';
import { apiFetch, apiFetchPage, ApiError } from '@/lib/api';

interface Business {
  id: string;
  tradeName: string;
  city: string;
  status: string;
  email: string;
  phone: string;
  categories?: { name: string }[];
  ratingAvg: number;
  reviewCount: number;
  createdAt: string;
}

const NOT_YET_LIVE = ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'];

const STATUS_TABS = [
  { value: '', label: 'Todas' },
  { value: 'PENDING', label: 'Pendientes' },
  { value: 'UNDER_REVIEW', label: 'En revisión' },
  { value: 'APPROVED', label: 'Aprobadas (por activar)' },
  { value: 'REJECTED', label: 'Rechazadas' },
];

export default function BusinessRequestsPage() {
  const [status, setStatus] = useState('');
  const [businesses, setBusinesses] = useState<Business[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      if (status) {
        const result = await apiFetchPage<Business>(`/admin/businesses?status=${status}&pageSize=100`);
        setBusinesses(result.data);
        setTotal(result.meta.total);
      } else {
        // No single backend status filter covers "still in the request pipeline", so pull
        // everything and keep only the statuses that aren't a live/paused business yet.
        const result = await apiFetchPage<Business>(`/admin/businesses?pageSize=200`);
        const filtered = result.data.filter((b) => NOT_YET_LIVE.includes(b.status));
        setBusinesses(filtered);
        setTotal(filtered.length);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar las solicitudes.');
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  // Approving no longer activates the business — it generates a contract that has to be signed
  // first (ContractsService, wired into BusinessesService.approve). The business goes ACTIVE on
  // its own once that signature lands (or via the manual "Activar" override below, for edge cases).
  async function approve(id: string) {
    setActingOn(id);
    try {
      await apiFetch(`/admin/businesses/${id}/approve`, { method: 'PATCH', body: JSON.stringify({}) });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'La acción falló.');
    } finally {
      setActingOn(null);
    }
  }

  async function runAction(id: string, action: 'activate' | 'reject') {
    setActingOn(id);
    try {
      await apiFetch(`/admin/businesses/${id}/${action}`, { method: 'PATCH', body: JSON.stringify({}) });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'La acción falló.');
    } finally {
      setActingOn(null);
    }
  }

  return (
    <AdminShell>
      <h1 className="bingo-page-title" style={{ marginBottom: 24 }}>Solicitudes de Negocios</h1>

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
        {businesses === null ? (
          <p>Cargando…</p>
        ) : businesses.length === 0 ? (
          <p>No hay solicitudes en este filtro.</p>
        ) : (
          <table className="bingo-table">
            <thead>
              <tr>
                <th>Negocio</th>
                <th>Categoría</th>
                <th>Ciudad</th>
                <th>Rating</th>
                <th>Estado</th>
                <th>Contacto</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {businesses.map((b) => (
                <tr key={b.id}>
                  <td>{b.tradeName}</td>
                  <td>{b.categories?.map((c) => c.name).join(', ') || '—'}</td>
                  <td>{b.city}</td>
                  <td>
                    <RatingCell ratingAvg={b.ratingAvg} reviewCount={b.reviewCount} />
                  </td>
                  <td>
                    <span className={`bingo-badge badge-${b.status.toLowerCase()}`}>{b.status}</span>
                  </td>
                  <td>
                    {b.email}
                    <br />
                    {b.phone}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <IconButton icon="view" label="Ver" href={`/businesses/${b.id}`} />
                      {(b.status === 'PENDING' || b.status === 'UNDER_REVIEW') && (
                        <>
                          <IconButton icon="approve" label="Aprobar" disabled={actingOn === b.id} onClick={() => approve(b.id)} />
                          <IconButton icon="reject" label="Rechazar" disabled={actingOn === b.id} onClick={() => runAction(b.id, 'reject')} />
                        </>
                      )}
                      {b.status === 'APPROVED' && (
                        <IconButton icon="approve" label="Activar" disabled={actingOn === b.id} onClick={() => runAction(b.id, 'activate')} />
                      )}
                    </div>
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
