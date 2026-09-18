'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CustomerShell from '@/components/CustomerShell';
import BackButton from '@/components/BackButton';
import EmptyState from '@/components/EmptyState';
import HorizontalChipRow from '@/components/HorizontalChipRow';
import PetFriendlyPhoto from '@/components/PetFriendlyPhoto';
import { apiFetch, ApiError } from '@/lib/api';

interface PetFriendlyPlace {
  id: string;
  name: string;
  category: 'RESTAURANT' | 'OUTDOOR_SPACE' | 'OTHER';
  description: string | null;
  address: string;
  photoUrl: string | null;
  ratingAvg: number;
  reviewCount: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  RESTAURANT: 'Restaurante',
  OUTDOOR_SPACE: 'Espacio al aire libre',
  OTHER: 'Otro',
};

const CATEGORY_ICONS: Record<string, string> = {
  RESTAURANT: '🍽️',
  OUTDOOR_SPACE: '🌳',
  OTHER: '📍',
};

const CATEGORY_TABS = [
  { value: '', label: 'Todos' },
  { value: 'RESTAURANT', label: 'Restaurantes' },
  { value: 'OUTDOOR_SPACE', label: 'Aire libre' },
  { value: 'OTHER', label: 'Otros' },
];

export default function PetFriendlyDirectoryPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [places, setPlaces] = useState<PetFriendlyPlace[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (category) params.set('category', category);
      params.set('pageSize', '100');
      const result = await apiFetch<PetFriendlyPlace[]>(`/public/pet-friendly-places?${params.toString()}`);
      setPlaces(result);
    } catch (err) {
      setPlaces([]);
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar el directorio.');
    }
  }, [search, category]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <CustomerShell>
      <header className="bingo-header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo%20para%20fondo%20osc.png" alt="BINGO+" className="bingo-logo-img" />
        <div className="bingo-header-sub">Espacios Pet Friendly · Lugares donde puedes ir con tu mascota, agregados por la comunidad</div>
        <form className="bingo-search" onSubmit={(e) => e.preventDefault()}>
          <input placeholder="Buscar un lugar…" value={search} onChange={(e) => setSearch(e.target.value)} onBlur={load} />
        </form>
      </header>

      <div className="bingo-content">
        {error && (
          <div className="bingo-error-banner" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}

        <BackButton onClick={() => router.push('/directory')} label="Categorías" />

        <HorizontalChipRow style={{ marginBottom: 14 }}>
          {CATEGORY_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setCategory(t.value)}
              className={`bingo-chip${category === t.value ? ' active' : ''}`}
            >
              {t.label}
            </button>
          ))}
        </HorizontalChipRow>

        <button className="bingo-button" style={{ marginBottom: 16 }} onClick={() => router.push('/pet-friendly/new')}>
          + Agregar un lugar
        </button>

        <a href="/pet-friendly/mine" style={{ display: 'block', fontSize: 13, color: 'var(--bingo-teal)', marginBottom: 16, fontWeight: 700 }}>
          Mis lugares enviados →
        </a>

        {places === null ? (
          <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
        ) : places.length === 0 ? (
          <EmptyState title="Aún no hay lugares" subtitle="Sé el primero en agregar un espacio pet friendly." />
        ) : (
          places.map((p) => (
            <a
              key={p.id}
              href={`/pet-friendly/${p.id}`}
              className="bingo-card"
              style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}
            >
              <PetFriendlyPhoto src={p.photoUrl} alt={p.name} width={64} height={64} borderRadius={10} fallbackIcon={CATEGORY_ICONS[p.category]} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: '#7f8ea3' }}>{CATEGORY_LABELS[p.category]}</div>
                <div style={{ fontSize: 12, color: '#9aa5b1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.address}</div>
                {p.reviewCount > 0 && (
                  <div style={{ fontSize: 12, marginTop: 2 }}>
                    ⭐ {p.ratingAvg.toFixed(1)} ({p.reviewCount})
                  </div>
                )}
              </div>
            </a>
          ))
        )}
      </div>
    </CustomerShell>
  );
}
