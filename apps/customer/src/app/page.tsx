'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CustomerShell from '@/components/CustomerShell';
import PromoStoreCard, { PromoStoreCardData } from '@/components/PromoStoreCard';
import HorizontalScroller from '@/components/HorizontalScroller';
import { apiFetch, getUserLocation } from '@/lib/api';

interface Profile {
  firstName: string;
}

export default function HomePage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [offers, setOffers] = useState<PromoStoreCardData[] | null>(null);
  const [favoriteStores, setFavoriteStores] = useState<PromoStoreCardData[] | null>(null);
  const [nearbyStores, setNearbyStores] = useState<PromoStoreCardData[] | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    apiFetch<Profile>('/me').then(setProfile).catch(() => undefined);
    apiFetch<PromoStoreCardData[]>('/public/offers/businesses').then(setOffers).catch(() => setOffers([]));
    apiFetch<PromoStoreCardData[]>('/me/favorites/businesses')
      .then(setFavoriteStores)
      .catch(() => setFavoriteStores([]));
    apiFetch<{ targetId: string }[]>('/me/favorites?targetType=BUSINESS')
      .then((rows) => setFavoriteIds(new Set(rows.map((r) => r.targetId))))
      .catch(() => undefined);

    getUserLocation().then((loc) => {
      const params = loc ? `?lat=${loc.lat}&lng=${loc.lng}` : '';
      apiFetch<PromoStoreCardData[]>(`/me/businesses${params}`)
        .then((stores) => setNearbyStores(stores.slice(0, 8)))
        .catch(() => setNearbyStores([]));
    });
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

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    // Per the marketplace UX principle: search from Home surfaces stores first, not products.
    router.push(`/stores?search=${encodeURIComponent(search)}`);
  }

  return (
    <CustomerShell>
      <header className="bingo-header">
        <div className="bingo-logo">
          BINGO<span className="plus">+</span>
        </div>
        <div className="bingo-header-sub">
          Hola{profile ? `, ${profile.firstName}` : ''} · Quito
        </div>
        <form className="bingo-search" onSubmit={submitSearch}>
          <input
            placeholder="¿Qué necesita tu mascota?"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>
      </header>

      <div className="bingo-content">
        {offers !== null && offers.length > 0 && (
          <>
            <h2 className="bingo-section-title">Ofertas</h2>
            <HorizontalScroller itemCount={offers.length}>
              {offers.map((b) => (
                <PromoStoreCard
                  key={b.id}
                  business={b}
                  favorited={favoriteIds.has(b.id)}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
            </HorizontalScroller>
          </>
        )}

        {favoriteStores !== null && favoriteStores.length > 0 && (
          <>
            <h2 className="bingo-section-title">Tiendas favoritas</h2>
            <HorizontalScroller itemCount={favoriteStores.length}>
              {favoriteStores.map((b) => (
                <PromoStoreCard key={b.id} business={b} favorited onToggleFavorite={toggleFavorite} />
              ))}
            </HorizontalScroller>
          </>
        )}

        <h2 className="bingo-section-title">Recomendado para tus mascotas</h2>
        {nearbyStores === null ? (
          <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
        ) : nearbyStores.length === 0 ? (
          <p style={{ color: '#7f8ea3', fontSize: 13 }}>Aún no hay tiendas activas.</p>
        ) : (
          <>
            <HorizontalScroller itemCount={nearbyStores.length}>
              {nearbyStores.map((b) => (
                <PromoStoreCard
                  key={b.id}
                  business={b}
                  favorited={favoriteIds.has(b.id)}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
            </HorizontalScroller>
            <a href="/stores" className="bingo-button secondary" style={{ display: 'block', textAlign: 'center', marginTop: 12 }}>
              Ver todas las tiendas
            </a>
          </>
        )}
      </div>
    </CustomerShell>
  );
}
