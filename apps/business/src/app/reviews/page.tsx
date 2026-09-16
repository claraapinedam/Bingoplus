'use client';

import { useCallback, useEffect, useState } from 'react';
import DashboardShell from '@/components/DashboardShell';
import EmptyState from '@/components/EmptyState';
import { apiFetch, apiFetchPage, ApiError, getActiveBusinessId } from '@/lib/api';

interface ReviewRow {
  id: string;
  targetType: string;
  rating: number;
  comment: string | null;
  businessReply: string | null;
  createdAt: string;
  author: { firstName: string; lastName: string };
}

function ReplyForm({ reviewId, onSaved }: { reviewId: string; onSaved: () => void }) {
  const businessId = getActiveBusinessId();
  const [reply, setReply] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!businessId || !reply.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/business/${businessId}/reviews/${reviewId}/reply`, { method: 'PATCH', body: JSON.stringify({ reply }) });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar la respuesta.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      {error && <div style={{ color: 'var(--bingo-error)', fontSize: 12, marginBottom: 6 }}>{error}</div>}
      <textarea className="bingo-input" rows={2} placeholder="Responder a esta reseña…" value={reply} onChange={(e) => setReply(e.target.value)} />
      <button className="bingo-button secondary small" style={{ width: 'auto', marginTop: 6 }} disabled={saving || !reply.trim()} onClick={submit}>
        {saving ? 'Enviando…' : 'Responder'}
      </button>
    </div>
  );
}

function ReviewsContent() {
  const businessId = getActiveBusinessId();
  const [reviews, setReviews] = useState<ReviewRow[] | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!businessId) return;
    apiFetchPage<ReviewRow>(`/business/${businessId}/reviews`)
      .then((r) => setReviews(r.data))
      .catch(() => setReviews([]));
  }, [businessId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <header className="dashboard-page-header">
        <div className="dashboard-page-title">Reseñas</div>
      </header>

      {reviews === null ? (
        <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
      ) : reviews.length === 0 ? (
        <EmptyState title="Aún no tienes reseñas" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 720 }}>
          {reviews.map((r) => (
            <div key={r.id} className="bingo-card">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 700 }}>
                  {r.author.firstName} {r.author.lastName} · {r.targetType}
                </div>
                <div>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</div>
              </div>
              {r.comment && <p style={{ fontSize: 13, color: '#54617a', marginTop: 6 }}>{r.comment}</p>}
              <div style={{ fontSize: 11, color: '#9aa5b1', marginTop: 4 }}>{new Date(r.createdAt).toLocaleDateString('es-EC')}</div>

              {r.businessReply ? (
                <div style={{ marginTop: 8, background: '#f7f9fb', borderRadius: 10, padding: 10, fontSize: 13 }}>
                  <strong>Tu respuesta:</strong> {r.businessReply}
                </div>
              ) : replyingTo === r.id ? (
                <ReplyForm reviewId={r.id} onSaved={() => { setReplyingTo(null); load(); }} />
              ) : (
                <button className="bingo-button secondary small" style={{ width: 'auto', marginTop: 8 }} onClick={() => setReplyingTo(r.id)}>
                  Responder
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default function ReviewsPage() {
  return (
    <DashboardShell>
      <ReviewsContent />
    </DashboardShell>
  );
}
