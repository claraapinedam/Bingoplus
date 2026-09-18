'use client';

import { useCallback, useEffect, useState } from 'react';
import IconButton from '@/components/IconButton';
import { apiFetch, apiFetchPage, ApiError } from '@/lib/api';

interface ReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  status: string;
  createdAt: string;
  author: { firstName: string; lastName: string; email: string };
  reports: { id: string }[];
}

/** Reviews live on the record of whatever they're rated (business, rider, pet-friendly place…) —
 * there is no separate global moderation page, so this is the one place hide/restore happens. */
export default function ReviewsList({ targetType, targetId }: { targetType: string; targetId: string }) {
  const [reviews, setReviews] = useState<ReviewRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await apiFetchPage<ReviewRow>(`/admin/reviews?targetType=${targetType}&targetId=${targetId}&pageSize=100`);
      setReviews(result.data);
      setTotal(result.meta.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar las reseñas.');
    }
  }, [targetType, targetId]);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(id: string, action: 'hide' | 'restore') {
    setBusy(id);
    try {
      await apiFetch(`/admin/reviews/${id}/${action}`, { method: 'PATCH', body: JSON.stringify({}) });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'La acción falló.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: '#7f8ea3', marginBottom: 14 }}>{total} reseña(s).</p>

      {error && <div className="bingo-card" style={{ marginBottom: 16, color: 'var(--bingo-error)' }}>{error}</div>}

      <div className="bingo-card">
        {reviews === null ? (
          <p>Cargando…</p>
        ) : reviews.length === 0 ? (
          <p>Sin reseñas todavía.</p>
        ) : (
          <table className="bingo-table">
            <thead>
              <tr>
                <th>Autor</th>
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
                  <td>{'★'.repeat(r.rating)}</td>
                  <td style={{ maxWidth: 240 }}>{r.comment ?? '—'}</td>
                  <td>{r.reports.length > 0 ? r.reports.length : '—'}</td>
                  <td>
                    <span className={`bingo-badge badge-${r.status.toLowerCase()}`}>{r.status}</span>
                  </td>
                  <td style={{ fontSize: 12 }}>{new Date(r.createdAt).toLocaleDateString('es-EC')}</td>
                  <td>
                    {r.status !== 'HIDDEN' ? (
                      <IconButton icon="reject" label="Ocultar" disabled={busy === r.id} onClick={() => runAction(r.id, 'hide')} />
                    ) : (
                      <IconButton icon="approve" label="Restaurar" disabled={busy === r.id} onClick={() => runAction(r.id, 'restore')} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
