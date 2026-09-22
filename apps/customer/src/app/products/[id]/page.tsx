'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import CustomerShell from '@/components/CustomerShell';
import BackButton from '@/components/BackButton';
import { apiFetch, ApiError } from '@/lib/api';

interface ProductDetail {
  id: string;
  name: string;
  description: string | null;
  price: string | number;
  salePrice: string | number | null;
  stock: number;
  category: { name: string };
  business: { id: string; tradeName: string; city: string };
  species: { id: string; name: string }[];
  // Same field the backend's TaxCalculationService keys off at checkout — STANDARD is taxed at
  // PricingConfiguration.defaultTaxPercent, ZERO is always 0%. Shown here so the tax is never a
  // surprise at the final checkout screen.
  taxCategory: 'STANDARD' | 'ZERO';
}

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

/** Read-only preview of the platform's current general tax rate — same rate
 * PriceCalculationService/TaxCalculationService apply server-side at checkout. Never hardcoded
 * here: PricingConfiguration.defaultTaxPercent can change (e.g. an SRI-mandated rate change), so
 * this always reflects whatever the backend would actually charge right now. */
function useDefaultTaxPercent() {
  const [percent, setPercent] = useState<number | null>(null);
  useEffect(() => {
    apiFetch<{ defaultTaxPercent: number }>('/public/pricing/tax-rate')
      .then((r) => setPercent(r.defaultTaxPercent))
      .catch(() => setPercent(null));
  }, []);
  return percent;
}

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const taxPercent = useDefaultTaxPercent();

  useEffect(() => {
    apiFetch<ProductDetail>(`/public/products/${params.id}`)
      .then(setProduct)
      .catch(() => setNotFound(true));
  }, [params.id]);

  async function addToCart(replaceCart = false) {
    setAdding(true);
    setError(null);
    setConflict(false);
    try {
      await apiFetch('/me/cart/items', {
        method: 'POST',
        body: JSON.stringify({ productId: params.id, quantity, replaceCart }),
      });
      setAdded(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConflict(true);
      } else {
        setError(err instanceof ApiError ? err.message : 'No se pudo agregar al carrito.');
      }
    } finally {
      setAdding(false);
    }
  }

  if (notFound) {
    return (
      <CustomerShell>
        <div className="bingo-content">
          <div className="bingo-empty">
            <div className="bingo-empty-title">Producto no disponible</div>
            <div>Puede que ya no exista o el negocio no esté activo.</div>
          </div>
        </div>
      </CustomerShell>
    );
  }

  if (!product) {
    return (
      <CustomerShell>
        <div className="bingo-content">
          <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
        </div>
      </CustomerShell>
    );
  }

  const price = Number(product.price);
  const salePrice = product.salePrice !== null ? Number(product.salePrice) : null;
  const effectivePrice = salePrice ?? price;

  return (
    <CustomerShell>
      <div style={{ padding: 16 }}>
        <BackButton onClick={() => router.back()} />

        <div
          style={{
            marginTop: 16,
            height: 180,
            borderRadius: 20,
            background: 'linear-gradient(135deg, #e6f7f1, #fff3ea)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 56,
            color: 'var(--bingo-teal)',
            fontWeight: 800,
          }}
        >
          {product.name.charAt(0).toUpperCase()}
        </div>

        <div style={{ marginTop: 16 }}>
          <span className="bingo-badge" style={{ background: '#eef1f5', color: '#7f8ea3' }}>
            {product.category.name}
          </span>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: '10px 0 4px' }}>{product.name}</h1>
          <a href={`/stores/${product.business.id}`} style={{ color: 'var(--bingo-teal)', fontSize: 13, fontWeight: 700 }}>
            {product.business.tradeName} · {product.business.city}
          </a>

          <div style={{ marginTop: 12, fontSize: 24, fontWeight: 800 }}>
            {salePrice !== null && (
              <span className="bingo-price-strike" style={{ fontSize: 16 }}>
                {currencyFormatter.format(price)}
              </span>
            )}
            {currencyFormatter.format(effectivePrice)}
          </div>

          {/* §"que no le sorprenda en el checkout": el desglose de impuestos se muestra aquí, al
              cargar el producto, en vez de recién en la confirmación del checkout. Usa la misma
              tasa (PricingConfiguration.defaultTaxPercent) que el backend aplicará realmente —
              nunca un valor inventado en el frontend — y respeta taxCategory (ZERO = 0%). */}
          <div className="bingo-card" style={{ marginTop: 12, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--bingo-navy)', marginBottom: 6 }}>
              Desglose de precio {quantity > 1 ? `(${quantity} unid.)` : ''}
            </div>
            {(() => {
              const lineSubtotal = effectivePrice * quantity;
              const isZeroRated = product.taxCategory === 'ZERO';
              const taxAmount = isZeroRated || taxPercent === null ? 0 : lineSubtotal * taxPercent;
              const lineTotal = lineSubtotal + taxAmount;
              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#54617a' }}>
                    <span>Valor del producto</span>
                    <span>{currencyFormatter.format(lineSubtotal)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#54617a', marginTop: 4 }}>
                    <span>
                      Impuesto {isZeroRated ? '(exento)' : taxPercent !== null ? `(${Math.round(taxPercent * 100)}%)` : ''}
                    </span>
                    <span>{taxPercent === null && !isZeroRated ? '—' : currencyFormatter.format(taxAmount)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 800, marginTop: 8 }}>
                    <span>Total estimado</span>
                    <span>{currencyFormatter.format(lineTotal)}</span>
                  </div>
                  <p style={{ fontSize: 11, color: '#9aa5b1', marginTop: 6, marginBottom: 0 }}>
                    No incluye envío ni tarifa de servicio — esos se calculan en el checkout.
                  </p>
                </>
              );
            })()}
          </div>

          {product.description && (
            <p style={{ color: '#54617a', fontSize: 14, marginTop: 12 }}>{product.description}</p>
          )}

          {product.species.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <span style={{ fontSize: 12, color: '#7f8ea3', marginRight: 6 }}>Especie recomendada:</span>
              {product.species.map((s) => (
                <span
                  key={s.id}
                  className="bingo-badge"
                  style={{ background: '#eef1f5', color: 'var(--bingo-navy)', marginRight: 4 }}
                >
                  {s.name}
                </span>
              ))}
            </div>
          )}

          <p style={{ fontSize: 12, color: product.stock > 0 ? '#7f8ea3' : 'var(--bingo-error)', marginTop: 8 }}>
            {product.stock > 0 ? `${product.stock} disponibles` : 'Sin stock'}
          </p>

          {conflict && (
            <div className="bingo-card" style={{ marginTop: 16, border: '1px solid var(--bingo-warning)' }}>
              <p style={{ margin: 0, fontSize: 13 }}>
                Tu carrito tiene productos de otro negocio. Solo puedes comprar de un negocio a la vez.
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="bingo-button small" onClick={() => addToCart(true)} disabled={adding}>
                  Vaciar y agregar este
                </button>
                <button className="bingo-button secondary small" onClick={() => setConflict(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {error && <div className="bingo-error-banner" style={{ marginTop: 16 }}>{error}</div>}

          {added ? (
            <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
              <button className="bingo-button secondary" onClick={() => setAdded(false)}>
                Seguir comprando
              </button>
              <a href="/cart" className="bingo-button" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                Ver carrito
              </a>
            </div>
          ) : (
            <div style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <button
                  className="bingo-button secondary small"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                >
                  −
                </button>
                <span style={{ fontWeight: 700 }}>{quantity}</span>
                <button
                  className="bingo-button secondary small"
                  onClick={() => setQuantity((q) => Math.min(product.stock, q + 1))}
                >
                  +
                </button>
              </div>
              <button
                className="bingo-button"
                disabled={adding || product.stock === 0}
                onClick={() => addToCart(false)}
              >
                {adding ? 'Agregando…' : 'Agregar al carrito'}
              </button>
            </div>
          )}
        </div>
      </div>
    </CustomerShell>
  );
}
