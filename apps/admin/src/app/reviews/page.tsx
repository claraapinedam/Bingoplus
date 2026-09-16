'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { apiFetchPage, apiFetch, ApiError } from '@/lib/api';

const STATUS_TABS = [
  { value: '', label: 'Todas' },
  { value: 'PUBLISHED', label: 'Publicadas' },
  { value: 'FLAGGED', label: 'Reportadas' },
  { value: 'HIDDEN', label: 'Ocultas' },
];

const TARGET_LABELS: Record<string, string> = {
  BUSINESS: 'Negocio',
  RIDER: 'Rider',
  PRODUCT: 'Producto',
  SERVICE: 'Servicio',
};

interface ReviewRow {
  id: string;
  targetType: string;
  targetId: string;
  rating: number;
  comment: string | null;
  status: string;
  createdAt: string;
  author: { firstName: string; lastName: string; email: string };
  reports: { id: string }[];
}

export default function AdminReviewsPage() {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [reviews, setReviews] = useState<ReviewRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ pageSize: '50' });
    if (status) params.set('status', status);
    if (search) params.set('search', search);
    const result = await apiFetchPage<ReviewRow>(`/admin/reviews?${params}`);
    setReviews(result.data);
    setTotal(result.meta.total);
  }, [status, search]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function runAction(id: string, action: 'hide' | 'restore') {
    setBusy(id);
    setError(null);
    try {
      await apiFetch(`/admin/reviews/${id}/${action}`, { method: 'PATCH', body: JSON.stringify({}) });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'La acción falló.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdminShell>
      <h1 className="bingo-page-title">Reseñas</h1>
      <p className="bingo-page-subtitle">{total} reseña(s) — moderación global. Toda acción queda registrada en Auditoría.</p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="bingo-input" style={{ maxWidth: 280 }} placeholder="Buscar en comentarios…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {STATUS_TABS.map((t) => (
            <button key={t.value} onClick={() => setStatus(t.value)} className={`bingo-button ${status === t.value ? '' : 'secondary'}`} style={{ padding: '8px 14px', fontSize: 13 }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="bingo-card" style={{ marginBottom: 16, color: 'var(--bingo-error)' }}>{error}</div>}

      <div className="bingo-card">
        {reviews === null ? (
          <p>Cargando…</p>
        ) : reviews.length === 0 ? (
          <p>No hay reseñas en este filtro.</p>
        ) : (
          <table className="bingo-table">
            <thead>
              <tr>
                <th>Autor</th>
                <th>Tipo</th>
                <th>Calificación</th>
                <th>Comentario</th>
                <th>Reportes</th>
                <th>Estado</th>
                <th>Fecha</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r.id}>
                  <td>{r.author.firstName} {r.author.lastName}</td>
                  <td>{TARGET_LABELS[r.targetType] ?? r.targetType}</td>
                  <td>{'★'.repeat(r.rating)}</td>
                  <td style={{ maxWidth: 240 }}>{r.comment ?? '—'}</td>
                  <td>{r.reports.length > 0 ? r.reports.length : '—'}</td>
                  <td>
                    <span className={`bingo-badge badge-${r.status.toLowerCase()}`}>{r.status}</span>
                  </td>
                  <td style={{ fontSize: 12 }}>{new Date(r.createdAt).toLocaleDateString('es-EC')}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    {r.status !== 'HIDDEN' ? (
                      <button className="bingo-button danger" style={{ padding: '6px 12px', fontSize: 12 }} disabled={busy === r.id} onClick={() => runAction(r.id, 'hide')}>
                        Ocultar
                      </button>
                    ) : (
                      <button className="bingo-button" style={{ padding: '6px 12px', fontSize: 12 }} disabled={busy === r.id} onClick={() => runAction(r.id, 'restore')}>
                        Restaurar
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
