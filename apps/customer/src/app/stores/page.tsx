'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import CustomerShell from '@/components/CustomerShell';
import HorizontalChipRow from '@/components/HorizontalChipRow';
import StoreListCard from '@/components/StoreListCard';
import { PromoStoreCardData } from '@/components/PromoStoreCard';
import SpeciesChips, { Species } from '@/components/SpeciesChips';
import EmptyState from '@/components/EmptyState';
import { apiFetch, ApiError, getUserLocation } from '@/lib/api';

interface ProductCategory {
  id: string;
  name: string;
  slug: string;
}

function StoresContent() {
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [speciesSlug, setSpeciesSlug] = useState('');
  const [productCategorySlug, setProductCategorySlug] = useState(searchParams.get('productCategory') ?? '');
  const [species, setSpecies] = useState<Species[]>([]);
  const [productCategories, setProductCategories] = useState<ProductCategory[]>([]);
  const [businesses, setBusinesses] = useState<PromoStoreCardData[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    apiFetch<Species[]>('/public/pet-species').then(setSpecies).catch(() => undefined);
    apiFetch<ProductCategory[]>('/public/product-categories').then(setProductCategories).catch(() => undefined);
    // Real device location, best-effort: never blocks the first render — stores load right away
    // and silently re-rank once (if) a real position comes back.
    getUserLocation().then(setLocation);
    apiFetch<{ targetId: string }[]>('/me/favorites?targetType=BUSINESS')
      .then((rows) => setFavoriteIds(new Set(rows.map((r) => r.targetId))))
      .catch(() => undefined);
  }, []);

  async function toggleFavorite(businessId: string) {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      next.has(businessId) ? next.delete(businessId) : next.add(businessId);
      return next;
    });
    try {
      await apiFetch('/me/favorites/toggle', {
        method: 'POST',
        body: JSON.stringify({ targetType: 'BUSINESS', targetId: businessId }),
      });
    } catch {
      // Roll back on failure — the optimistic toggle above was wrong.
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        next.has(businessId) ? next.delete(businessId) : next.add(businessId);
        return next;
      });
    }
  }

  const load = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (speciesSlug) params.set('species', speciesSlug);
    if (productCategorySlug) params.set('productCategory', productCategorySlug);
    if (location) {
      params.set('lat', String(location.lat));
      params.set('lng', String(location.lng));
    }
    try {
      const data = await apiFetch<PromoStoreCardData[]>(`/me/businesses?${params.toString()}`);
      setBusinesses(data);
    } catch (err) {
      setBusinesses([]);
      setError(err instanceof ApiError ? err.message : 'No se pudieron cargar las tiendas.');
    }
  }, [search, speciesSlug, productCategorySlug, location]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <CustomerShell>
      <header className="bingo-header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo%20para%20fondo%20osc.png" alt="BINGO+" className="bingo-logo-img" />
        <div className="bingo-header-sub">
          Tiendas · {location ? 'Ordenadas por relevancia y cercanía' : 'Ordenadas para tus mascotas'}
        </div>
        <form className="bingo-search" onSubmit={(e) => e.preventDefault()}>
          <input
            placeholder="Buscar tiendas…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={load}
          />
        </form>
      </header>

      <div className="bingo-content">
        <SpeciesChips species={species} active={speciesSlug} onSelect={setSpeciesSlug} />

        <div style={{ marginTop: 10 }}>
          <HorizontalChipRow>
            <button
              className={`bingo-chip${productCategorySlug === '' ? ' active' : ''}`}
              onClick={() => setProductCategorySlug('')}
            >
              Todas las categorías
            </button>
            {productCategories.map((c) => (
              <button
                key={c.id}
                className={`bingo-chip${productCategorySlug === c.slug ? ' active' : ''}`}
                onClick={() => setProductCategorySlug(c.slug)}
              >
                {c.name}
              </button>
            ))}
          </HorizontalChipRow>
        </div>

        {error && <div className="bingo-error-banner" style={{ marginTop: 12 }}>{error}</div>}

        <div style={{ marginTop: 16 }}>
          {businesses === null ? (
            <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
          ) : businesses.length === 0 ? (
            <EmptyState title="No encontramos tiendas" subtitle="Prueba con otro filtro o búsqueda." />
          ) : (
            businesses.map((b) => (
              <StoreListCard
                key={b.id}
                business={b}
                favorited={favoriteIds.has(b.id)}
                onToggleFavorite={toggleFavorite}
              />
            ))
          )}
        </div>
      </div>
    </CustomerShell>
  );
}

export default function StoresPage() {
  return (
    <Suspense fallback={null}>
      <StoresContent />
    </Suspense>
  );
}
