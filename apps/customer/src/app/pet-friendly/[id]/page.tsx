'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import CustomerShell from '@/components/CustomerShell';
import RatingStars from '@/components/RatingStars';
import { apiFetch, ApiError, getAccessToken } from '@/lib/api';

interface PetFriendlyPlaceDetail {
  id: string;
  name: string;
  category: 'RESTAURANT' | 'OUTDOOR_SPACE' | 'OTHER';
  description: string | null;
  address: string;
  latitude: number;
  longitude: number;
  photoUrl: string | null;
  ratingAvg: number;
  reviewCount: number;
}

interface PlaceReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  author: { firstName: string; lastName: string };
}

const CATEGORY_LABELS: Record<string, string> = {
  RESTAURANT: 'Restaurante',
  OUTDOOR_SPACE: 'Espacio al aire libre',
  OTHER: 'Otro',
};

export default function PetFriendlyPlaceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [place, setPlace] = useState<PetFriendlyPlaceDetail | null | undefined>(undefined);
  const [reviews, setReviews] = useState<PlaceReview[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([
        apiFetch<PetFriendlyPlaceDetail>(`/public/pet-friendly-places/${params.id}`),
        apiFetch<PlaceReview[]>(`/pet-friendly-places/${params.id}/reviews`),
      ]);
      setPlace(p);
      setReviews(r);
    } catch (err) {
      setPlace(null);
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar este lugar.');
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  function openDirections() {
    if (!place) return;
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}`, '_blank');
  }

  async function submitReview(e: FormEvent) {
    e.preventDefault();
    if (rating === 0) return;
    if (!getAccessToken()) {
      router.push('/login');
      return;
    }
    setSubmitting(true);
    setReviewError(null);
    try {
      const updated = await apiFetch<PlaceReview[]>(`/pet-friendly-places/${params.id}/reviews`, {
        method: 'POST',
        body: JSON.stringify({ rating, comment: comment || undefined }),
      });
      setReviews(updated);
      setRating(0);
      setComment('');
      const refreshed = await apiFetch<PetFriendlyPlaceDetail>(`/public/pet-friendly-places/${params.id}`);
      setPlace(refreshed);
    } catch (err) {
      setReviewError(err instanceof ApiError ? err.message : 'No se pudo enviar tu reseña.');
    } finally {
      setSubmitting(false);
    }
  }

  if (place === undefined) {
    return (
      <CustomerShell>
        <div className="bingo-content">
          <p>Cargando…</p>
        </div>
      </CustomerShell>
    );
  }

  if (!place) {
    return (
      <CustomerShell>
        <div className="bingo-content">
          <div className="bingo-error-banner">{error ?? 'Lugar no encontrado.'}</div>
        </div>
      </CustomerShell>
    );
  }

  return (
    <CustomerShell>
      <div className="bingo-content" style={{ paddingTop: 16 }}>
        <button className="bingo-button secondary small" style={{ width: 'auto', marginBottom: 14 }} onClick={() => router.back()}>
          ← Volver
        </button>

        {place.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={place.photoUrl} alt={place.name} style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 'var(--radius-lg)', marginBottom: 14 }} />
        )}

        <h1 style={{ margin: '0 0 4px', fontSize: 20 }}>{place.name}</h1>
        <div style={{ fontSize: 13, color: '#7f8ea3', marginBottom: 8 }}>{CATEGORY_LABELS[place.category]}</div>

        {place.reviewCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <RatingStars value={Math.round(place.ratingAvg)} readOnly size={16} />
            <span style={{ fontSize: 13, color: '#7f8ea3' }}>
              {place.ratingAvg.toFixed(1)} ({place.reviewCount} reseña{place.reviewCount === 1 ? '' : 's'})
            </span>
          </div>
        )}

        <div className="bingo-card" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, marginBottom: place.description ? 10 : 0 }}>📍 {place.address}</div>
          {place.description && <p style={{ fontSize: 13, color: '#5a6472', margin: 0 }}>{place.description}</p>}
        </div>

        <button className="bingo-button" style={{ marginBottom: 20 }} onClick={openDirections}>
          🧭 Cómo llegar
        </button>

        <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 10px' }}>Reseñas</h2>

        {reviewError && <div className="bingo-error-banner" style={{ marginBottom: 12 }}>{reviewError}</div>}

        <form onSubmit={submitReview} className="bingo-card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Deja tu calificación</div>
          <RatingStars value={rating} onChange={setRating} />
          <textarea
            className="bingo-input"
            rows={2}
            maxLength={500}
            placeholder="Cuéntanos tu experiencia (opcional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            style={{ marginTop: 10 }}
          />
          <button className="bingo-button" type="submit" disabled={submitting || rating === 0} style={{ marginTop: 10 }}>
            {submitting ? 'Enviando…' : 'Enviar reseña'}
          </button>
        </form>

        {reviews.length === 0 ? (
          <p style={{ fontSize: 13, color: '#7f8ea3' }}>Aún no hay reseñas. ¡Sé el primero!</p>
        ) : (
          reviews.map((r) => (
            <div key={r.id} className="bingo-card" style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>
                  {r.author.firstName} {r.author.lastName}
                </span>
                <RatingStars value={r.rating} readOnly size={14} />
              </div>
              {r.comment && <p style={{ fontSize: 13, color: '#5a6472', margin: 0 }}>{r.comment}</p>}
            </div>
          ))
        )}
      </div>
    </CustomerShell>
  );
}
