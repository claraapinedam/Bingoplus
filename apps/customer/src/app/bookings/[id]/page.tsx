'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import CustomerShell from '@/components/CustomerShell';
import BackButton from '@/components/BackButton';
import EmptyState from '@/components/EmptyState';
import { apiFetch, ApiError } from '@/lib/api';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente de confirmación',
  CONFIRMED: 'Confirmada',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'No asistió',
};

// A Payment's `provider` is either the real (Sandbox) card provider name or this literal for a
// cash-to-the-business payment — see BookingsService.chooseCashPayment/markCashPaid on the API.
const CASH_PROVIDER = 'CASH';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

interface BookingPayment {
  id: string;
  provider: string;
  status: string;
}

interface BookingDetail {
  id: string;
  status: string;
  date: string;
  startTime: string;
  endTime: string;
  price: string | number;
  tax: string | number;
  serviceFee: string | number;
  total: string | number;
  notes: string | null;
  service: { name: string; description: string | null };
  pet: { name: string } | null;
  business: { tradeName: string; city: string; addressLine: string; phone: string | null };
  atCustomerHome: boolean;
  payment: BookingPayment | null;
}

export default function BookingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const idempotencyKey = useRef(crypto.randomUUID());
  const [booking, setBooking] = useState<BookingDetail | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [showCancelForm, setShowCancelForm] = useState(false);

  const load = useCallback(() => {
    apiFetch<BookingDetail>(`/me/bookings/${params.id}`).then(setBooking).catch(() => setBooking(null));
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/me/bookings/${params.id}/cancel`, { method: 'PATCH', body: JSON.stringify({}) });
      load();
      setShowCancelForm(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cancelar la reserva.');
    } finally {
      setBusy(false);
    }
  }

  // "Pagar con tarjeta": mirrors /checkout's create-payment + confirm pair (same Sandbox
  // PaymentService flow, just re-targeted at a booking) — if a card Payment was already created
  // for this booking (e.g. a previous attempt), skip straight to confirming it instead of trying
  // to create a second one.
  async function payWithCard() {
    setBusy(true);
    setPayError(null);
    try {
      if (!booking?.payment) {
        await apiFetch(`/me/bookings/${params.id}/payment`, {
          method: 'POST',
          body: JSON.stringify({ idempotencyKey: idempotencyKey.current }),
        });
      }
      await apiFetch(`/me/bookings/${params.id}/payment/confirm`, { method: 'POST', body: JSON.stringify({}) });
      load();
    } catch (err) {
      setPayError(err instanceof ApiError ? err.message : 'No se pudo procesar el pago.');
    } finally {
      setBusy(false);
    }
  }

  async function payWithCash() {
    setBusy(true);
    setPayError(null);
    try {
      await apiFetch(`/me/bookings/${params.id}/pay-cash`, { method: 'POST', body: JSON.stringify({}) });
      load();
    } catch (err) {
      setPayError(err instanceof ApiError ? err.message : 'No se pudo registrar la elección de pago.');
    } finally {
      setBusy(false);
    }
  }

  if (booking === undefined) {
    return (
      <CustomerShell>
        <div className="bingo-content">
          <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
        </div>
      </CustomerShell>
    );
  }
  if (!booking) {
    return (
      <CustomerShell>
        <div className="bingo-content">
          <EmptyState title="Reserva no encontrada" />
        </div>
      </CustomerShell>
    );
  }

  const canCancel = booking.status === 'PENDING' || booking.status === 'CONFIRMED';

  return (
    <CustomerShell>
      <header className="bingo-header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo%20para%20fondo%20osc.png" alt="BINGO+" className="bingo-logo-img" style={{ display: 'block', marginBottom: 10 }} />
        <BackButton onClick={() => router.back()} light />
        <div className="bingo-header-sub">{booking.service.name}</div>
      </header>

      <div className="bingo-content">
        {error && (
          <div className="bingo-card" style={{ marginBottom: 14, color: 'var(--bingo-error)' }}>
            {error}
          </div>
        )}

        <div className="bingo-card">
          <span className="bingo-badge" style={{ background: '#f2f4f7' }}>
            {STATUS_LABELS[booking.status] ?? booking.status}
          </span>

          <div style={{ marginTop: 12, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div>
              <strong>Negocio:</strong> {booking.business.tradeName}
            </div>
            <div>
              <strong>Ubicación:</strong>{' '}
              {booking.atCustomerHome ? 'A domicilio (en tu dirección)' : `${booking.business.addressLine}, ${booking.business.city}`}
            </div>
            {booking.business.phone && (
              <div>
                <strong>Teléfono:</strong> {booking.business.phone}
              </div>
            )}
            <div>
              <strong>Mascota:</strong> {booking.pet?.name ?? '—'}
            </div>
            <div>
              <strong>Fecha:</strong> {new Date(booking.date).toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
            <div>
              <strong>Hora:</strong>{' '}
              {new Date(booking.startTime).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })} –{' '}
              {new Date(booking.endTime).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div>
              <strong>Precio del servicio:</strong> {currencyFormatter.format(Number(booking.price))}
            </div>
            <div>
              <strong>Total a pagar:</strong> {currencyFormatter.format(Number(booking.total))}
            </div>
            {booking.notes && (
              <div>
                <strong>Notas:</strong> {booking.notes}
              </div>
            )}
          </div>
        </div>

        {booking.status === 'CONFIRMED' && (
          <div className="bingo-card" style={{ marginTop: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 10px' }}>Pago</h2>

            {payError && <div className="bingo-error-banner" style={{ marginBottom: 12 }}>{payError}</div>}

            {!booking.payment && (
              <>
                <p style={{ fontSize: 13, color: '#54617a', marginBottom: 10 }}>
                  Tu reserva fue confirmada. Elige cómo quieres pagarla.
                </p>
                {/* Checkout con tarjeta: valor del servicio, más impuestos, más tarifa de servicio —
                    mostrado siempre antes de cobrar, aplique a "efectivo" o "tarjeta" (el efectivo
                    sigue cobrando solo el precio del servicio; ver bookings.service.ts). */}
                <div className="bingo-card" style={{ background: '#f8f9fb', marginBottom: 10, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#54617a' }}>
                    <span>Valor del servicio</span>
                    <span>{currencyFormatter.format(Number(booking.price))}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#54617a' }}>
                    <span>Impuestos</span>
                    <span>{currencyFormatter.format(Number(booking.tax))}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#54617a' }}>
                    <span>Tarifa de servicio</span>
                    <span>{currencyFormatter.format(Number(booking.serviceFee))}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, marginTop: 6 }}>
                    <span>Total con tarjeta</span>
                    <span>{currencyFormatter.format(Number(booking.total))}</span>
                  </div>
                  <p style={{ fontSize: 11, color: '#9aa5b1', marginTop: 6, marginBottom: 0 }}>
                    Si pagas en efectivo al negocio, el monto es solo el valor del servicio ({currencyFormatter.format(Number(booking.price))}).
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="bingo-button" style={{ width: 'auto' }} disabled={busy} onClick={payWithCard}>
                    💳 Pagar con tarjeta
                  </button>
                  <button className="bingo-button secondary" style={{ width: 'auto' }} disabled={busy} onClick={payWithCash}>
                    💵 Pagar en efectivo
                  </button>
                </div>
                <p style={{ fontSize: 11, color: '#9aa5b1', marginTop: 8 }}>
                  Pago de prueba (sandbox) — no se procesa ningún cargo real.
                </p>
              </>
            )}

            {booking.payment && booking.payment.provider === CASH_PROVIDER && booking.payment.status !== 'PAID' && (
              <span className="bingo-badge" style={{ background: '#fff3ea', color: 'var(--bingo-coral)' }}>
                💵 Efectivo — paga al negocio antes de que inicie el servicio
              </span>
            )}

            {booking.payment && booking.payment.provider === CASH_PROVIDER && booking.payment.status === 'PAID' && (
              <span className="bingo-badge" style={{ background: '#e7f8ef', color: '#1f9d55' }}>✅ Pagado en efectivo</span>
            )}

            {booking.payment && booking.payment.provider !== CASH_PROVIDER && booking.payment.status === 'PAID' && (
              <span className="bingo-badge" style={{ background: '#e7f8ef', color: '#1f9d55' }}>✅ Pagado con tarjeta</span>
            )}

            {booking.payment && booking.payment.provider !== CASH_PROVIDER && booking.payment.status !== 'PAID' && (
              <>
                <span className="bingo-badge" style={{ background: '#fdeceb', color: 'var(--bingo-error)' }}>
                  Pago con tarjeta no completado
                </span>
                <div>
                  <button className="bingo-button" style={{ marginTop: 10, width: 'auto' }} disabled={busy} onClick={payWithCard}>
                    Reintentar pago
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {canCancel && !showCancelForm && (
          <button
            className="bingo-button secondary"
            style={{ marginTop: 16, color: 'var(--bingo-error)' }}
            onClick={() => setShowCancelForm(true)}
          >
            Cancelar reserva
          </button>
        )}

        {showCancelForm && (
          <div style={{ marginTop: 16 }}>
            <p style={{ fontSize: 13, color: '#54617a' }}>¿Seguro que quieres cancelar esta reserva?</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="bingo-button" style={{ background: 'var(--bingo-error)' }} disabled={busy} onClick={cancel}>
                Sí, cancelar
              </button>
              <button className="bingo-button secondary" onClick={() => setShowCancelForm(false)}>
                No
              </button>
            </div>
          </div>
        )}
      </div>
    </CustomerShell>
  );
}
