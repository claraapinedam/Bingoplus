'use client';

import { useCallback, useEffect, useState } from 'react';
import CustomerShell from '@/components/CustomerShell';
import EmptyState from '@/components/EmptyState';
import { apiFetch, ApiError } from '@/lib/api';

interface CartItem {
  id: string;
  quantity: number;
  unitPriceSnapshot: string | number;
  // Same field the product page's price preview already keys off — carried through here too so
  // the tax estimate doesn't disappear between "add to cart" and "view cart" (checkout itself
  // still computes the authoritative total; this is only a running preview, same as the product page).
  product: { name: string; stock: number; taxCategory: 'STANDARD' | 'ZERO' };
  variant: { stock: number } | null;
}

interface Cart {
  id: string;
  business: { tradeName: string };
  items: CartItem[];
  subtotal: number;
}

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

/** Same live rate the product page already previews with, and the backend actually applies at
 * checkout (PricingConfiguration.defaultTaxPercent) — never hardcoded here. */
function useDefaultTaxPercent() {
  const [percent, setPercent] = useState<number | null>(null);
  useEffect(() => {
    apiFetch<{ defaultTaxPercent: number }>('/public/pricing/tax-rate')
      .then((r) => setPercent(r.defaultTaxPercent))
      .catch(() => setPercent(null));
  }, []);
  return percent;
}

export default function CartPage() {
  const [cart, setCart] = useState<Cart | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const taxPercent = useDefaultTaxPercent();

  const load = useCallback(() => {
    apiFetch<Cart | null>('/me/cart')
      .then(setCart)
      .catch(() => setError('No se pudo cargar el carrito.'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function updateQuantity(itemId: string, quantity: number) {
    setBusyItem(itemId);
    setError(null);
    try {
      if (quantity <= 0) {
        await apiFetch(`/me/cart/items/${itemId}`, { method: 'DELETE' });
      } else {
        await apiFetch(`/me/cart/items/${itemId}`, {
          method: 'PATCH',
          body: JSON.stringify({ quantity }),
        });
      }
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar el carrito.');
    } finally {
      setBusyItem(null);
    }
  }

  async function clearCart() {
    setError(null);
    try {
      await apiFetch('/me/cart', { method: 'DELETE' });
      load();
    } catch {
      setError('No se pudo vaciar el carrito.');
    }
  }

  return (
    <CustomerShell>
      <header className="bingo-header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo%20para%20fondo%20osc.png" alt="BINGO+" className="bingo-logo-img" />
        <div className="bingo-header-sub">Tu carrito</div>
      </header>

      <div className="bingo-content">
        {error && <div className="bingo-error-banner">{error}</div>}

        {cart === undefined ? (
          <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
        ) : cart === null ? (
          <EmptyState
            title="Tu carrito está vacío"
            subtitle="Explora productos y agrégalos aquí."
          />
        ) : (
          <>
            <p style={{ fontWeight: 700, marginBottom: 12 }}>{cart.business.tradeName}</p>

            {cart.items.map((item) => {
              const stock = item.variant?.stock ?? item.product.stock;
              return (
                <div key={item.id} className="bingo-card" style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{item.product.name}</div>
                      <div style={{ fontSize: 12, color: '#7f8ea3' }}>
                        {currencyFormatter.format(Number(item.unitPriceSnapshot))} c/u
                      </div>
                    </div>
                    <div style={{ fontWeight: 800 }}>
                      {currencyFormatter.format(Number(item.unitPriceSnapshot) * item.quantity)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
                    <button
                      className="bingo-button secondary small"
                      disabled={busyItem === item.id}
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    >
                      −
                    </button>
                    <span style={{ fontWeight: 700 }}>{item.quantity}</span>
                    <button
                      className="bingo-button secondary small"
                      disabled={busyItem === item.id || item.quantity >= stock}
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    >
                      +
                    </button>
                    <button
                      className="bingo-button secondary small"
                      style={{ marginLeft: 'auto', color: 'var(--bingo-error)' }}
                      disabled={busyItem === item.id}
                      onClick={() => updateQuantity(item.id, 0)}
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              );
            })}

            {(() => {
              const estimatedTax = cart.items.reduce((sum, item) => {
                if (item.product.taxCategory === 'ZERO' || taxPercent === null) return sum;
                return sum + Number(item.unitPriceSnapshot) * item.quantity * taxPercent;
              }, 0);
              return (
                <div className="bingo-card" style={{ marginTop: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                    <span>Subtotal</span>
                    <span>{currencyFormatter.format(cart.subtotal)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginTop: 4 }}>
                    <span>Impuesto {taxPercent !== null ? `(${Math.round(taxPercent * 100)}%)` : ''}</span>
                    <span>{taxPercent === null ? '—' : currencyFormatter.format(estimatedTax)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, marginTop: 8, paddingTop: 8, borderTop: '1px solid #eef1f5' }}>
                    <span>Total estimado</span>
                    <span>{currencyFormatter.format(cart.subtotal + estimatedTax)}</span>
                  </div>
                  <p style={{ fontSize: 12, color: '#7f8ea3', marginTop: 6 }}>
                    Delivery y comisiones se calculan en el checkout.
                  </p>
                </div>
              );
            })()}

            <a href="/checkout" className="bingo-button" style={{ marginTop: 16, display: 'block', textAlign: 'center' }}>
              Ir al checkout
            </a>

            <button className="bingo-button secondary" style={{ marginTop: 10 }} onClick={clearCart}>
              Vaciar carrito
            </button>
          </>
        )}
      </div>
    </CustomerShell>
  );
}
