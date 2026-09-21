import { gradientFor } from './PromoStoreCard';

export interface DirectoryListCardData {
  id: string;
  tradeName: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  city: string;
  categories: { name: string; icon: string | null }[];
  ratingAvg: number;
  reviewCount: number;
  distanceKm: number | null;
  isOpenNow: boolean | null;
  closesAt: string | null;
  /** Only present when the business has a real active BusinessCoupon — never a fabricated discount. */
  offer?: { title: string };
  moreOffersCount?: number;
}

/** Known seed category icon slugs (see prisma/seed.ts) mapped to an emoji — falls back to 🏢.
 * Exported so the Directory landing page's category grid uses the exact same icons as the cards. */
export const CATEGORY_ICONS: Record<string, string> = {
  'shopping-bag': '🛍️',
  stethoscope: '🩺',
  home: '🏠',
  bed: '🛏️',
  scissors: '✂️',
  footprints: '🐾',
  paw: '🐾',
  truck: '🚚',
  'graduation-cap': '🎓',
  sparkles: '✨',
};

export default function DirectoryListCard({
  business,
  favorited,
  onToggleFavorite,
}: {
  business: DirectoryListCardData;
  favorited?: boolean;
  onToggleFavorite?: (businessId: string) => void;
}) {
  return (
    <a
      href={`/stores/${business.id}`}
      className="bingo-card"
      style={{ display: 'block', marginBottom: 12, padding: 0, overflow: 'hidden' }}
    >
      <div
        style={{
          height: 130,
          position: 'relative',
          background: business.coverImageUrl
            ? `center / cover no-repeat url(${business.coverImageUrl})`
            : gradientFor(business.id),
        }}
      >
        {business.offer && (
          <div
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              right: 10,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 6,
            }}
          >
            <span
              className="bingo-badge"
              style={{ background: 'rgba(255,255,255,0.95)', color: 'var(--bingo-coral)', fontSize: 11 }}
            >
              🏷️ {business.offer.title}
            </span>
            {!!business.moreOffersCount && (
              <span
                className="bingo-badge"
                style={{ background: 'rgba(23,43,77,0.85)', color: 'white', fontSize: 11, flexShrink: 0 }}
              >
                {business.moreOffersCount} más
              </span>
            )}
          </div>
        )}
      </div>

      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: '#eef1f5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              flexShrink: 0,
              overflow: 'hidden',
            }}
          >
            {business.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={business.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              CATEGORY_ICONS[business.categories[0]?.icon ?? ''] ?? '🏢'
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: 15 }}>{business.tradeName}</div>
          {onToggleFavorite && (
            <button
              aria-label={favorited ? 'Quitar de favoritos' : 'Agregar a favoritos'}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleFavorite(business.id);
              }}
              style={{ border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer', flexShrink: 0 }}
            >
              {favorited ? '❤️' : '🤍'}
            </button>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 8,
            fontSize: 13,
            color: '#54617a',
          }}
        >
          <span>
            {business.distanceKm !== null && <>📍 {business.distanceKm.toFixed(1)} km · </>}
            {business.isOpenNow === true ? (
              <span style={{ color: 'var(--bingo-success)' }}>
                Abierto{business.closesAt ? ` · Hasta ${business.closesAt}` : ''}
              </span>
            ) : business.isOpenNow === false ? (
              <span style={{ color: 'var(--bingo-error)' }}>Cerrado</span>
            ) : (
              business.categories.map((c) => c.name).join(' · ')
            )}
          </span>
          <span style={{ flexShrink: 0 }}>
            ★ {business.ratingAvg.toFixed(1)} ({business.reviewCount}+)
          </span>
        </div>
      </div>
    </a>
  );
}
