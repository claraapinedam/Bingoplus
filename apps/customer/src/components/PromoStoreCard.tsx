export interface PromoStoreCardData {
  id: string;
  tradeName: string;
  description: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  category: { name: string };
  ratingAvg: number;
  reviewCount: number;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  /** Only set once the business owner configures it — never fabricated when DELIVERY is off. */
  deliveryFeeUsd: string | number | null;
  deliveryEstimateMinutes: number | null;
  /** Only present when the business has a real active BusinessCoupon — never a fabricated discount. */
  offer?: { title: string };
  moreOffersCount?: number;
}

const BANNER_GRADIENTS = [
  'linear-gradient(135deg, #172b4d, #16a085)',
  'linear-gradient(135deg, #ff6b5e, #f5a524)',
  'linear-gradient(135deg, #16a085, #22a06b)',
  'linear-gradient(135deg, #6b4bff, #ff6b5e)',
];

export function gradientFor(id: string) {
  const index = id.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % BANNER_GRADIENTS.length;
  return BANNER_GRADIENTS[index];
}

export default function PromoStoreCard({
  business,
  favorited,
  onToggleFavorite,
}: {
  business: PromoStoreCardData;
  favorited?: boolean;
  onToggleFavorite?: (businessId: string) => void;
}) {
  return (
    <a
      href={`/stores/${business.id}`}
      className="bingo-card"
      style={{ display: 'block', width: 230, flex: 'none', scrollSnapAlign: 'start', padding: 0, overflow: 'hidden' }}
    >
      <div
        style={{
          height: 110,
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
              top: 8,
              left: 8,
              right: 8,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 6,
            }}
          >
            <span
              className="bingo-badge"
              style={{ background: 'rgba(255,255,255,0.95)', color: 'var(--bingo-coral)', fontSize: 10 }}
            >
              🏷️ {business.offer.title}
            </span>
            {!!business.moreOffersCount && (
              <span
                className="bingo-badge"
                style={{ background: 'rgba(23,43,77,0.85)', color: 'white', fontSize: 10, flexShrink: 0 }}
              >
                {business.moreOffersCount} más
              </span>
            )}
          </div>
        )}

        {onToggleFavorite && (
          <button
            aria-label={favorited ? 'Quitar de favoritos' : 'Agregar a favoritos'}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleFavorite(business.id);
            }}
            style={{
              position: 'absolute',
              bottom: 8,
              right: 8,
              border: 'none',
              background: 'rgba(255,255,255,0.9)',
              borderRadius: 999,
              width: 26,
              height: 26,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {favorited ? '❤️' : '🤍'}
          </button>
        )}
      </div>

      <div style={{ padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 10,
              background: '#eef1f5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 800,
              color: 'var(--bingo-navy)',
              flexShrink: 0,
              overflow: 'hidden',
            }}
          >
            {business.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={business.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              business.tradeName.charAt(0).toUpperCase()
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontWeight: 800,
                fontSize: 13,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {business.tradeName}
            </div>
            <div
              style={{
                fontSize: 11,
                color: '#7f8ea3',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {business.description ?? business.category.name}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, fontSize: 11 }}>
          <span>
            ★ {business.ratingAvg.toFixed(1)} ({business.reviewCount})
          </span>
          {business.deliveryEnabled && <span>🛵 Delivery</span>}
          {business.pickupEnabled && <span>🏪 Pickup</span>}
        </div>
      </div>
    </a>
  );
}
