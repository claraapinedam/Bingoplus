'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminShell from '@/components/AdminShell';
import ReviewsList from '@/components/ReviewsList';
import BackButton from '@/components/BackButton';
import PlaceImage from '@/components/PlaceImage';
import { apiFetch, ApiError } from '@/lib/api';

interface PetFriendlyPlace {
  id: string;
  name: string;
  category: 'RESTAURANT' | 'OUTDOOR_SPACE' | 'OTHER';
  address: string;
  description: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  photoUrl: string | null;
  rejectionReason: string | null;
  ratingAvg: number;
  reviewCount: number;
  createdAt: string;
  submittedBy: { firstName: string; lastName: string; id: string };
}

const CATEGORY_LABELS: Record<string, string> = {
  RESTAURANT: 'Restaurante',
  OUTDOOR_SPACE: 'Espacio al aire libre',
  OTHER: 'Otro',
};

export default function PetFriendlyPlaceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [place, setPlace] = useState<PetFriendlyPlace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPlace(await apiFetch<PetFriendlyPlace>(`/admin/pet-friendly-places/${params.id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar el lugar.');
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function approve() {
    setActingOn('place');
    try {
      await apiFetch(`/admin/pet-friendly-places/${params.id}/approve`, { method: 'PATCH', body: JSON.stringify({}) });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'La acción falló.');
    } finally {
      setActingOn(null);
    }
  }

  async function reject() {
    const reason = window.prompt('Motivo del rechazo (opcional):') ?? undefined;
    setActingOn('place');
    try {
      await apiFetch(`/admin/pet-friendly-places/${params.id}/reject`, { method: 'PATCH', body: JSON.stringify({ reason }) });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'La acción falló.');
    } finally {
      setActingOn(null);
    }
  }

  async function suspend() {
    setActingOn('place');
    try {
      await apiFetch(`/admin/pet-friendly-places/${params.id}/suspend`, { method: 'PATCH', body: JSON.stringify({}) });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'La acción falló.');
    } finally {
      setActingOn(null);
    }
  }

  async function reactivate() {
    setActingOn('place');
    try {
      await apiFetch(`/admin/pet-friendly-places/${params.id}/reactivate`, { method: 'PATCH', body: JSON.stringify({}) });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'La acción falló.');
    } finally {
      setActingOn(null);
    }
  }

  if (error && !place) {
    return (
      <AdminShell>
        <div className="bingo-card" style={{ color: 'var(--bingo-error)' }}>{error}</div>
      </AdminShell>
    );
  }

  if (!place) {
    return (
      <AdminShell>
        <p>Cargando…</p>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <BackButton onClick={() => router.back()} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
        <h1 className="bingo-page-title" style={{ margin: 0 }}>{place.name}</h1>
        <span>{CATEGORY_LABELS[place.category]} · {place.address}</span>
        <span className={`bingo-badge badge-${place.status.toLowerCase()}`}>{place.status}</span>
      </div>

      {error && (
        <div className="bingo-card" style={{ marginBottom: 16, color: 'var(--bingo-error)' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div className="bingo-card">
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 14px' }}>Solicitud / Estado</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {place.status === 'PENDING' && (
              <>
                <button className="bingo-button" disabled={actingOn === 'place'} onClick={approve}>
                  Aprobar
                </button>
                <button className="bingo-button danger" disabled={actingOn === 'place'} onClick={reject}>
                  Rechazar
                </button>
              </>
            )}
            {place.status === 'REJECTED' && (
              <p style={{ fontSize: 13, color: '#7f8ea3', margin: 0 }}>
                Rechazado{place.rejectionReason ? `: ${place.rejectionReason}` : '.'}
              </p>
            )}
            {place.status === 'APPROVED' && (
              <button className="bingo-button danger" disabled={actingOn === 'place'} onClick={suspend}>
                Suspender
              </button>
            )}
            {place.status === 'SUSPENDED' && (
              <button className="bingo-button" disabled={actingOn === 'place'} onClick={reactivate}>
                Reactivar
              </button>
            )}
          </div>
        </div>

        <div className="bingo-card">
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 10px' }}>Datos</h2>
          <div style={{ fontSize: 13, marginBottom: 6 }}>
            Enviado por: <strong>{place.submittedBy.firstName} {place.submittedBy.lastName}</strong>
          </div>
          {place.description && <div style={{ fontSize: 13, marginBottom: 6 }}>Descripción: {place.description}</div>}
          <div style={{ fontSize: 13 }}>
            Rating: {place.ratingAvg.toFixed(1)} ★ ({place.reviewCount} reseña(s))
          </div>
          <div style={{ maxWidth: 240, marginTop: 10 }}>
            <PlaceImage src={place.photoUrl} alt={place.name} width="100%" height={200} borderRadius={8} />
          </div>
        </div>
      </div>

      <h2 className="bingo-section-title">Reseñas</h2>
      <ReviewsList targetType="PET_FRIENDLY_PLACE" targetId={place.id} />
    </AdminShell>
  );
}
