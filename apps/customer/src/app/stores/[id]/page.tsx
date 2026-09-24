'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import CustomerShell from '@/components/CustomerShell';
import ProductCard, { ProductCardData } from '@/components/ProductCard';
import EmptyState from '@/components/EmptyState';
import BackButton from '@/components/BackButton';
import { apiFetch, getUserLocation } from '@/lib/api';
import { groupOpeningHours } from '@/lib/openingHours';
import { formatServiceDuration } from '@/lib/serviceDuration';

interface BusinessDetail {
  id: string;
  tradeName: string;
  description: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  city: string;
  addressLine: string;
  phone: string;
  latitude: number | null;
  longitude: number | null;
  ratingAvg: number;
  reviewCount: number;
  categories: { name: string }[];
  capabilities: Record<string, boolean>;
  openingHours: Record<string, { open: string; close: string }> | null;
  /** False only for a Directory-only business that exclusively offers "servicio a domicilio" —
   * no premises of its own for a customer to visit, so the address/"Cómo llegar" don't apply. */
  hasPhysicalLocation: boolean;
  /** Rough "X min" proximity reference from the customer's shared location — null when location
   * wasn't shared or the business has no coordinates on file. See BusinessesService.getPublicBusiness. */
  etaMinutes: number | null;
  /** Connect/disconnect status — display only, the real gate is server-side on add-to-cart/checkout. */
  onlineStatus: { online: boolean; source: 'MANUAL' | 'SCHEDULE'; isOpenNow: boolean | null; closesAt: string | null };
}

const SERVICE_TYPE_LABELS: Record<string, string> = {
  VETERINARY: 'Veterinario',
  GROOMING: 'Grooming',
  DAYCARE: 'Guardería',
  BOARDING: 'Hospedaje',
  DOG_WALKING: 'Paseador',
  TRAINING: 'Adiestramiento',
  OTHER: 'Otro',
};

interface ServiceSummary {
  id: string;
  type: string;
  name: string;
  price: string | number;
  durationMinutes: number;
  imageUrl: string | null;
}

interface PromotionSummary {
  id: string;
  name: string;
  type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  value: string | number;
}

export default function StoreDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [business, setBusiness] = useState<BusinessDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [products, setProducts] = useState<ProductCardData[] | null>(null);
  const [services, setServices] = useState<ServiceSummary[] | null>(null);
  const [promotions, setPromotions] = useState<PromotionSummary[]>([]);
  const [favorited, setFavorited] = useState(false);
  const [coverBroken, setCoverBroken] = useState(false);
  const [logoBroken, setLogoBroken] = useState(false);

  useEffect(() => {
    getUserLocation().then((loc) => {
      const qs = loc ? `?lat=${loc.lat}&lng=${loc.lng}` : '';
      apiFetch<BusinessDetail>(`/public/businesses/${params.id}${qs}`)
        .then(setBusiness)
        .catch(() => setNotFound(true));
    });
    apiFetch<ProductCardData[]>(`/public/products?businessId=${params.id}&pageSize=50`)
      .then(setProducts)
      .catch(() => setProducts([]));
    apiFetch<ServiceSummary[]>(`/public/services?businessId=${params.id}`)
      .then(setServices)
      .catch(() => setServices([]));
    apiFetch<PromotionSummary[]>(`/public/promotions?businessId=${params.id}`)
      .then(setPromotions)
      .catch(() => setPromotions([]));
    apiFetch<{ targetId: string }[]>('/me/favorites?targetType=BUSINESS')
      .then((rows) => setFavorited(rows.some((r) => r.targetId === params.id)))
      .catch(() => undefined);
  }, [params.id]);

  async function toggleFavorite() {
    setFavorited((f) => !f);
    try {
      await apiFetch('/me/favorites/toggle', {
        method: 'POST',
        body: JSON.stringify({ targetType: 'BUSINESS', targetId: params.id }),
      });
    } catch {
      setFavorited((f) => !f);
    }
  }

  if (notFound) {
    return (
      <CustomerShell>
        <div className="bingo-content">
          <EmptyState title="Tienda no disponible" subtitle="Puede que ya no esté activa." />
        </div>
      </CustomerShell>
    );
  }

  if (!business) {
    return (
      <CustomerShell>
        <div className="bingo-content">
          <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
        </div>
      </CustomerShell>
    );
  }

  return (
    <CustomerShell>
      <div
        style={{
          height: 120,
          background: 'linear-gradient(135deg, #172b4d, #16a085)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {business.coverImageUrl && !coverBroken && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={business.coverImageUrl}
            alt=""
            onError={() => setCoverBroken(true)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
        <BackButton onClick={() => router.back()} light style={{ position: 'absolute', top: 12, left: 12, marginBottom: 0 }} />
        <button
          aria-label={favorited ? 'Quitar de favoritos' : 'Agregar a favoritos'}
          onClick={toggleFavorite}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            border: 'none',
            background: 'white',
            borderRadius: 999,
            width: 36,
            height: 36,
            fontSize: 16,
            cursor: 'pointer',
          }}
        >
          {favorited ? '❤️' : '🤍'}
        </button>
      </div>

      <div style={{ padding: 16 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            background: 'white',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 26,
            fontWeight: 800,
            color: 'var(--bingo-teal)',
            overflow: 'hidden',
          }}
        >
          {business.logoUrl && !logoBroken ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={business.logoUrl}
              alt={business.tradeName}
              onError={() => setLogoBroken(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            business.tradeName.charAt(0).toUpperCase()
          )}
        </div>

        <h1 style={{ fontSize: 20, fontWeight: 800, margin: '12px 0 4px' }}>{business.tradeName}</h1>
        <div style={{ fontSize: 13, color: '#7f8ea3' }}>
          {business.categories.map((c) => c.name).join(' · ')}
          {business.hasPhysicalLocation && ` · ${business.addressLine}, ${business.city}`}
        </div>
        {!business.onlineStatus.online && business.capabilities.SELLS_PRODUCTS && (
          <div className="bingo-badge" style={{ background: '#fdecea', color: 'var(--bingo-error)', marginTop: 6 }}>
            🔴 Desconectado — no acepta pedidos en este momento
          </div>
        )}
        {/* Por seguridad del negocio: la dirección exacta ("Cómo llegar") ya no se ofrece aquí para
            negocios de servicios — solo se revela una vez la reserva está confirmada (ver
            bookings/[id]) o, para tiendas, al elegir retiro en tienda en el checkout. Aquí solo se
            ofrece llamar (negocios de servicios) y una referencia de cercanía en minutos. */}
        {business.capabilities.SERVICES && business.phone && (
          <a
            href={`tel:${business.phone}`}
            className="bingo-button secondary small"
            style={{ width: 'auto', marginTop: 8, textDecoration: 'none', display: 'inline-block' }}
          >
            📞 Llamar al negocio
          </a>
        )}
        {business.etaMinutes != null && (
          <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 6 }}>📍 A {business.etaMinutes} min de ti</div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10, fontSize: 13 }}>
          <span>★ {business.ratingAvg.toFixed(1)} ({business.reviewCount})</span>
          {business.capabilities.DELIVERY && (
            <span className="bingo-badge" style={{ background: '#e6f7f1', color: 'var(--bingo-teal)' }}>
              🛵 Delivery
            </span>
          )}
          {business.capabilities.PICKUP && (
            <span className="bingo-badge" style={{ background: '#eef1f5', color: 'var(--bingo-navy)' }}>
              🏪 Pickup
            </span>
          )}
          {business.capabilities.SERVICES && (
            <span className="bingo-badge" style={{ background: '#fff3ea', color: 'var(--bingo-coral)' }}>
              ✂️ Servicios
            </span>
          )}
          {business.capabilities.BOOKINGS && (
            <span className="bingo-badge" style={{ background: '#fff3ea', color: 'var(--bingo-coral)' }}>
              📅 Reservas
            </span>
          )}
        </div>

        {business.description && (
          <p style={{ fontSize: 13, color: '#54617a', marginTop: 12 }}>{business.description}</p>
        )}

        {promotions.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {promotions.map((p) => (
              <div
                key={p.id}
                style={{ background: '#fff3ea', color: 'var(--bingo-coral)', borderRadius: 10, padding: '8px 12px', fontSize: 13, fontWeight: 700 }}
              >
                🎯 {p.name} — {p.type === 'PERCENTAGE' ? `${p.value}% de descuento` : `$${p.value} de descuento`}
              </div>
            ))}
          </div>
        )}

        {business.openingHours && (
          <div style={{ marginTop: 12, fontSize: 12, color: '#54617a' }}>
            {groupOpeningHours(business.openingHours).map((row) => (
              <div key={row.label}>{row.label}</div>
            ))}
          </div>
        )}

        {business.capabilities.SERVICES && (
          <>
            <h2 className="bingo-section-title">Servicios</h2>
            {services === null ? (
              <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
            ) : services.length === 0 ? (
              <EmptyState title="No hay servicios disponibles" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {services.map((s) => (
                  <a
                    key={s.id}
                    href={`/services/${s.id}`}
                    className="bingo-card"
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
                      <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 2 }}>
                        {SERVICE_TYPE_LABELS[s.type] ?? s.type} · {formatServiceDuration(s.type, s.durationMinutes)}
                      </div>
                    </div>
                    <div style={{ fontWeight: 800 }}>${Number(s.price).toFixed(2)}</div>
                  </a>
                ))}
              </div>
            )}
          </>
        )}

        {business.capabilities.SELLS_PRODUCTS && (
          <>
            <h2 className="bingo-section-title">Catálogo</h2>
            {products === null ? (
              <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
            ) : products.length === 0 ? (
              <EmptyState title="Esta tienda aún no tiene productos" />
            ) : (
              <div className="bingo-product-grid">
                {products.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </CustomerShell>
  );
}
