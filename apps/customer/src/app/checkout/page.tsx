'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import CustomerShell from '@/components/CustomerShell';
import EmptyState from '@/components/EmptyState';
import HorizontalChipRow from '@/components/HorizontalChipRow';
import { apiFetch, ApiError } from '@/lib/api';
import { API_ERROR_MESSAGES } from '@/lib/orderStatus';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

interface Cart {
  id: string;
  business: { id: string; tradeName: string };
  items: unknown[];
}

interface BusinessCapabilities {
  PICKUP: boolean;
  DELIVERY: boolean;
}

interface PickupLocation {
  addressLine: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
}

interface Address {
  id: string;
  label: string;
  line1: string;
  line2: string | null;
  state: string | null;
  city: string;
  notes: string | null;
  isDefault: boolean;
}

interface ValidateResponse {
  valid: boolean;
  business: { id: string; tradeName: string };
  address: { id: string; label: string; line1: string; city: string } | null;
  items: { productName: string; quantity: number; unitPrice: number; subtotal: number }[];
  subtotal: number;
  discount: number;
  taxes: number;
  serviceFee: number;
  deliveryFee: number;
  total: number;
  currency: string;
}

type FulfillmentType = 'PICKUP' | 'DELIVERY';

export default function CheckoutPage() {
  const router = useRouter();
  const idempotencyKey = useRef(crypto.randomUUID());

  const [cart, setCart] = useState<Cart | null | undefined>(undefined);
  const [capabilities, setCapabilities] = useState<BusinessCapabilities | null>(null);
  const [pickupLocation, setPickupLocation] = useState<PickupLocation | null>(null);
  const [deliveryAddress, setDeliveryAddress] = useState<Address | null | undefined>(undefined);
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType | null>(null);

  const [validation, setValidation] = useState<ValidateResponse | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Cart | null>('/me/cart')
      .then((c) => {
        setCart(c);
        if (c) {
          apiFetch<{ capabilities: BusinessCapabilities } & PickupLocation>(`/public/businesses/${c.business.id}`).then((b) => {
            setCapabilities(b.capabilities);
            setFulfillmentType(b.capabilities.PICKUP ? 'PICKUP' : 'DELIVERY');
            setPickupLocation({ addressLine: b.addressLine, city: b.city, latitude: b.latitude, longitude: b.longitude });
          });
        }
      })
      .catch(() => setCart(null));
    apiFetch<Address[]>('/addresses')
      .then((list) => setDeliveryAddress(list.find((a) => a.isDefault) ?? list[0] ?? null))
      .catch(() => setDeliveryAddress(null));
  }, []);

  const addressId = fulfillmentType === 'DELIVERY' ? (deliveryAddress?.id ?? null) : null;

  const runValidate = useCallback(async () => {
    if (!fulfillmentType) return;
    if (fulfillmentType === 'DELIVERY' && !addressId) {
      setValidation(null);
      return;
    }
    setValidationError(null);
    try {
      const res = await apiFetch<ValidateResponse>('/checkout/validate', {
        method: 'POST',
        body: JSON.stringify({
          fulfillmentType,
          addressId: fulfillmentType === 'DELIVERY' ? addressId : undefined,
        }),
      });
      setValidation(res);
    } catch (err) {
      setValidation(null);
      setValidationError(
        err instanceof ApiError ? (API_ERROR_MESSAGES[err.code] ?? err.message) : 'No se pudo calcular el total.',
      );
    }
  }, [fulfillmentType, addressId]);

  useEffect(() => {
    runValidate();
  }, [runValidate]);

  async function pay() {
    if (!fulfillmentType || !validation?.valid) return;
    setPaying(true);
    setPayError(null);
    try {
      const created = await apiFetch<{ order: { id: string }; payment: { id: string } }>(
        '/checkout/create-payment',
        {
          method: 'POST',
          body: JSON.stringify({
            fulfillmentType,
            addressId: fulfillmentType === 'DELIVERY' ? addressId : undefined,
            idempotencyKey: idempotencyKey.current,
          }),
        },
      );
      await apiFetch('/checkout/confirm', {
        method: 'POST',
        body: JSON.stringify({ paymentId: created.payment.id }),
      });
      router.push(`/orders/${created.order.id}`);
    } catch (err) {
      setPayError(
        err instanceof ApiError ? (API_ERROR_MESSAGES[err.code] ?? err.message) : 'No se pudo procesar el pago.',
      );
      setPaying(false);
    }
  }

  if (cart === undefined) {
    return (
      <CustomerShell>
        <div className="bingo-content">
          <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
        </div>
      </CustomerShell>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <CustomerShell>
        <div className="bingo-content">
          <EmptyState title="Tu carrito está vacío" subtitle="Agrega productos antes de pagar." />
        </div>
      </CustomerShell>
    );
  }

  return (
    <CustomerShell>
      <header className="bingo-header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo%20para%20fondo%20osc.png" alt="BINGO+" className="bingo-logo-img" />
        <div className="bingo-header-sub">Checkout · {cart.business.tradeName}</div>
      </header>

      <div className="bingo-content">
        {capabilities && (capabilities.PICKUP || capabilities.DELIVERY) && (
          <>
            <h2 className="bingo-section-title" style={{ marginTop: 0 }}>
              ¿Cómo lo quieres recibir?
            </h2>
            <HorizontalChipRow>
              {capabilities.PICKUP && (
                <button
                  className={`bingo-chip${fulfillmentType === 'PICKUP' ? ' active' : ''}`}
                  onClick={() => setFulfillmentType('PICKUP')}
                >
                  🏪 Retiro en tienda
                </button>
              )}
              {capabilities.DELIVERY && (
                <button
                  className={`bingo-chip${fulfillmentType === 'DELIVERY' ? ' active' : ''}`}
                  onClick={() => setFulfillmentType('DELIVERY')}
                >
                  🛵 Delivery
                </button>
              )}
            </HorizontalChipRow>
          </>
        )}

        {fulfillmentType === 'PICKUP' && pickupLocation && (
          <div className="bingo-card" style={{ marginTop: 4 }}>
            <div style={{ fontSize: 13, color: '#54617a' }}>
              {pickupLocation.addressLine}, {pickupLocation.city}
            </div>
            {pickupLocation.latitude != null && pickupLocation.longitude != null && (
              <button
                className="bingo-button secondary small"
                style={{ width: 'auto', marginTop: 8 }}
                onClick={() =>
                  window.open(
                    `https://www.google.com/maps/dir/?api=1&destination=${pickupLocation.latitude},${pickupLocation.longitude}`,
                    '_blank',
                  )
                }
              >
                🧭 Cómo llegar
              </button>
            )}
          </div>
        )}

        {fulfillmentType === 'DELIVERY' && (
          <>
            <h2 className="bingo-section-title">Dirección de entrega</h2>
            {deliveryAddress === undefined ? (
              <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
            ) : deliveryAddress ? (
              <a
                href="/addresses?returnTo=checkout"
                className="bingo-card"
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{deliveryAddress.label}</div>
                  <div style={{ fontSize: 12, color: '#7f8ea3' }}>
                    {deliveryAddress.line1}
                    {deliveryAddress.line2 ? `, ${deliveryAddress.line2}` : ''}, {deliveryAddress.city}
                    {deliveryAddress.state ? `, ${deliveryAddress.state}` : ''}
                  </div>
                </div>
                <span style={{ fontSize: 13, color: 'var(--bingo-teal)', fontWeight: 700, flexShrink: 0 }}>
                  Cambiar
                </span>
              </a>
            ) : (
              <a href="/addresses/new?returnTo=checkout" className="bingo-button secondary" style={{ display: 'block', textAlign: 'center' }}>
                + Agregar dirección de entrega
              </a>
            )}
          </>
        )}

        {validationError && <div className="bingo-error-banner" style={{ marginTop: 16 }}>{validationError}</div>}

        {validation?.valid && (
          <div className="bingo-card" style={{ marginTop: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 10px' }}>Resumen</h2>
            {validation.items.map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span>
                  {item.quantity}× {item.productName}
                </span>
                <span>{currencyFormatter.format(item.subtotal)}</span>
              </div>
            ))}
            <hr style={{ border: 'none', borderTop: '1px solid #eef1f5', margin: '10px 0' }} />
            {[
              ['Subtotal', validation.subtotal],
              ['Descuento', -validation.discount],
              ['Impuestos', validation.taxes],
              ['Tarifa de servicio', validation.serviceFee],
              ['Envío', validation.deliveryFee],
            ].map(([label, value]) => (
              <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#54617a' }}>
                <span>{label}</span>
                <span>{currencyFormatter.format(value as number)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, marginTop: 8 }}>
              <span>Total</span>
              <span>{currencyFormatter.format(validation.total)}</span>
            </div>
          </div>
        )}

        {payError && <div className="bingo-error-banner" style={{ marginTop: 12 }}>{payError}</div>}

        <button
          className="bingo-button"
          style={{ marginTop: 16 }}
          disabled={!validation?.valid || paying}
          onClick={pay}
        >
          {paying ? 'Procesando…' : validation ? `Pagar ${currencyFormatter.format(validation.total)}` : 'Pagar'}
        </button>
        <p style={{ fontSize: 11, color: '#9aa5b1', textAlign: 'center', marginTop: 8 }}>
          Pago de prueba (sandbox) — no se procesa ningún cargo real.
        </p>
      </div>
    </CustomerShell>
  );
}
