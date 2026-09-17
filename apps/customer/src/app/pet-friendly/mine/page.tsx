'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CustomerShell from '@/components/CustomerShell';
import EmptyState from '@/components/EmptyState';
import { apiFetch, ApiError } from '@/lib/api';

interface MyPlace {
  id: string;
  name: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason: string | null;
  createdAt: string;
}

const STATUS_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  PENDING: { label: 'En revisión', bg: '#fff4e5', color: 'var(--bingo-warning)' },
  APPROVED: { label: 'Aprobado', bg: '#e8f7f0', color: 'var(--bingo-success)' },
  REJECTED: { label: 'Rechazado', bg: '#fdecec', color: 'var(--bingo-error)' },
};

export default function MyPetFriendlyPlacesPage() {
  const router = useRouter();
  const [places, setPlaces] = useState<MyPlace[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<MyPlace[]>('/me/pet-friendly-places')
      .then(setPlaces)
      .catch((err) => {
        setPlaces([]);
        setError(err instanceof ApiError ? err.message : 'No se pudo cargar tus lugares.');
      });
  }, []);

  return (
    <CustomerShell>
      <div className="bingo-content" style={{ paddingTop: 16 }}>
        <button className="bingo-button secondary small" style={{ width: 'auto', marginBottom: 14 }} onClick={() => router.back()}>
          ← Volver
        </button>
        <h1 style={{ fontSize: 20, margin: '0 0 4px' }}>Mis lugares enviados</h1>
        <p style={{ fontSize: 13, color: '#7f8ea3', margin: '0 0 16px' }}>Espacios pet friendly que has agregado al directorio.</p>

        {error && <div className="bingo-error-banner" style={{ marginBottom: 12 }}>{error}</div>}

        {places === null ? (
          <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
        ) : places.length === 0 ? (
          <EmptyState title="Aún no has agregado lugares" subtitle="Comparte un espacio pet friendly con la comunidad." />
        ) : (
          places.map((p) => {
            const status = STATUS_STYLES[p.status];
            return (
              <a
                key={p.id}
                href={p.status === 'APPROVED' ? `/pet-friendly/${p.id}` : '#'}
                className="bingo-card"
                style={{ display: 'block', marginBottom: 10, cursor: p.status === 'APPROVED' ? 'pointer' : 'default' }}
                onClick={(e) => {
                  if (p.status !== 'APPROVED') e.preventDefault();
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</span>
                  <span className="bingo-badge" style={{ background: status.bg, color: status.color }}>
                    {status.label}
                  </span>
                </div>
                {p.status === 'REJECTED' && p.rejectionReason && (
                  <p style={{ fontSize: 12, color: 'var(--bingo-error)', margin: '6px 0 0' }}>Motivo: {p.rejectionReason}</p>
                )}
              </a>
            );
          })
        )}
      </div>
    </CustomerShell>
  );
}
