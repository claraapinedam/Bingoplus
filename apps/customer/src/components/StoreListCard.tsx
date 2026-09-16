import { PromoStoreCardData, gradientFor } from './PromoStoreCard';

/** Full-width version of PromoStoreCard for a vertically-stacked listing (e.g. /stores). */
export default function StoreListCard({
  business,
  favorited,
  onToggleFavorite,
}: {
  business: PromoStoreCardData;
  favorited?: boolean;
  onToggleFavorite?: (businessId: string) => void;
}) {
  const showDeliveryInfo =
    business.deliveryEnabled && business.deliveryFeeUsd !== null && business.deliveryEstimateMinutes !== null;

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
              fontSize: 15,
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
            {showDeliveryInfo ? (
              <>
                🛵 Costo de envío: ${Number(business.deliveryFeeUsd).toFixed(2)} · {business.deliveryEstimateMinutes}{' '}
                min
              </>
            ) : business.deliveryEnabled ? (
              '🛵 Delivery disponible'
            ) : business.pickupEnabled ? (
              '🏪 Retiro en tienda'
            ) : (
              business.category.name
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
