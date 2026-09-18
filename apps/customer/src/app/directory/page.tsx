'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CustomerShell from '@/components/CustomerShell';
import BackButton from '@/components/BackButton';
import DirectoryListCard, { CATEGORY_ICONS, DirectoryListCardData } from '@/components/DirectoryListCard';
import EmptyState from '@/components/EmptyState';
import { apiFetch, ApiError, getUserLocation } from '@/lib/api';

interface BusinessCategory {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
}

// "Tiendas"/"Delivery" are the two retail-type categories — the Directory never shows a business
// in either one (see DirectoryService.list()'s category filter on the backend), so offering them
// as filter chips here would always just return an empty result. Same partition BusinessApplyForm
// uses on the Business Portal side. "pet-friendly" used to be a business category here too — it's
// now the community-submitted /pet-friendly directory instead (a distinct tile below, never a
// registered Business), excluded defensively in case a stale category row ever lingers.
const NON_DIRECTORY_CATEGORY_SLUGS = ['tiendas', 'delivery', 'pet-friendly'];

function DirectoryContent() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [categorySlug, setCategorySlug] = useState('');
  const [categories, setCategories] = useState<BusinessCategory[]>([]);
  const [businesses, setBusinesses] = useState<DirectoryListCardData[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    apiFetch<BusinessCategory[]>('/public/business-categories')
      .then((list) => setCategories(list.filter((c) => !NON_DIRECTORY_CATEGORY_SLUGS.includes(c.slug))))
      .catch(() => undefined);
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
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        next.has(businessId) ? next.delete(businessId) : next.add(businessId);
        return next;
      });
    }
  }

  const showList = categorySlug !== '' || search.trim() !== '';

  const load = useCallback(async () => {
    if (categorySlug === '' && search.trim() === '') return; // landing shows categories, not a fetch
    setError(null);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (categorySlug) params.set('category', categorySlug);
    if (location) {
      params.set('lat', String(location.lat));
      params.set('lng', String(location.lng));
    }
    try {
      const data = await apiFetch<DirectoryListCardData[]>(`/public/directory?${params.toString()}`);
      setBusinesses(data);
    } catch (err) {
      setBusinesses([]);
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar el directorio.');
    }
  }, [search, categorySlug, location]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <CustomerShell>
      <header className="bingo-header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo%20para%20fondo%20osc.png" alt="BINGO+" className="bingo-logo-img" />
        <div className="bingo-header-sub">
          Directorio · Veterinarias, hoteles, groomers y más
        </div>
        <form className="bingo-search" onSubmit={(e) => e.preventDefault()}>
          <input
            placeholder="Buscar negocios…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={load}
          />
        </form>
      </header>

      <div className="bingo-content">
        {error && <div className="bingo-error-banner" style={{ marginBottom: 12 }}>{error}</div>}

        {!showList ? (
          // Landing: browse by category instead of one long mixed feed — pick a category to see
          // only that group (e.g. all the groomers together), not everyone at once.
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategorySlug(c.slug)}
                className="bingo-card"
                style={{ textAlign: 'center', padding: '22px 12px', border: 'none', cursor: 'pointer' }}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>{CATEGORY_ICONS[c.icon ?? ''] ?? '🏢'}</div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{c.name}</div>
              </button>
            ))}
            {/* Not a Business category — a community directory of places (not registered
                BINGO+ businesses) that welcome pets, submitted by users and approved by admins. */}
            <button
              onClick={() => router.push('/pet-friendly')}
              className="bingo-card"
              style={{ textAlign: 'center', padding: '22px 12px', border: 'none', cursor: 'pointer' }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>🐾</div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>Espacios Pet Friendly</div>
            </button>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 14 }}>
              <BackButton
                onClick={() => {
                  setCategorySlug('');
                  setSearch('');
                }}
                label="Categorías"
              />
              {categorySlug && (
                <div style={{ fontWeight: 800, fontSize: 15, marginTop: -8 }}>
                  {CATEGORY_ICONS[categories.find((c) => c.slug === categorySlug)?.icon ?? ''] ?? '🏢'}{' '}
                  {categories.find((c) => c.slug === categorySlug)?.name}
                </div>
              )}
            </div>

            {businesses === null ? (
              <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
            ) : businesses.length === 0 ? (
              <EmptyState title="No encontramos negocios" subtitle="Prueba con otra categoría o búsqueda." />
            ) : (
              businesses.map((b) => (
                <DirectoryListCard
                  key={b.id}
                  business={b}
                  favorited={favoriteIds.has(b.id)}
                  onToggleFavorite={toggleFavorite}
                />
              ))
            )}
          </>
        )}
      </div>
    </CustomerShell>
  );
}

export default function DirectoryPage() {
  return (
    <Suspense fallback={null}>
      <DirectoryContent />
    </Suspense>
  );
}
