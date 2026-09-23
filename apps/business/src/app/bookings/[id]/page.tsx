'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';
import EmptyState from '@/components/EmptyState';
import { apiFetch, ApiError, getActiveBusinessId } from '@/lib/api';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
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
  source: 'APP' | 'MANUAL';
  date: string;
  startTime: string;
  endTime: string;
  price: string | number;
  // serviceFee deliberately NOT part of this interface — see the "Precio" section below, which
  // mirrors apps/business's own Order detail page: the business only ever sees what it actually
  // gets (price + tax), never BINGO+'s own service-fee cut.
  tax: string | number;
  notes: string | null;
  atCustomerHome: boolean;
  service: { name: string; description: string | null };
  pet: { name: string; species: { name: string } } | null;
  // Null for a MANUAL block — see BookingsService.createManualBlock.
  user: { firstName: string; lastName: string; phone: string | null } | null;
  payment: BookingPayment | null;
}

function BookingDetailContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const businessId = getActiveBusinessId();
  const [booking, setBooking] = useState<BookingDetail | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelForm, setShowCancelForm] = useState(false);

  const load = useCallback(() => {
    if (!businessId) return;
    apiFetch<BookingDetail>(`/business/${businessId}/bookings/${params.id}`)
      .then(setBooking)
      .catch(() => setBooking(null));
  }, [businessId, params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(action: 'confirm' | 'complete' | 'no-show' | 'mark-paid') {
    if (!businessId) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/business/${businessId}/bookings/${params.id}/${action}`, { method: 'PATCH', body: JSON.stringify({}) });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'La acción falló.');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!businessId) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/business/${businessId}/bookings/${params.id}/cancel`, {
        method: 'PATCH',
        body: JSON.stringify({ reason: cancelReason || undefined }),
      });
      setShowCancelForm(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cancelar la reserva.');
    } finally {
      setBusy(false);
    }
  }

  if (booking === undefined) {
    return <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>;
  }
  if (!booking) {
    return <EmptyState title="Reserva no encontrada" />;
  }

  const isManual = booking.source === 'MANUAL';
  const canConfirm = !isManual && booking.status === 'PENDING';
  const canCancel = booking.status === 'PENDING' || booking.status === 'CONFIRMED';
  const canComplete = !isManual && booking.status === 'CONFIRMED';
  const canNoShow = !isManual && booking.status === 'CONFIRMED';
  const canMarkCashPaid = booking.payment?.provider === CASH_PROVIDER && booking.payment.status !== 'PAID';
  const paymentBadge = !booking.payment
    ? !isManual && booking.status === 'CONFIRMED'
      ? { label: 'Esperando elección de pago', bg: '#f2f4f7', color: undefined }
      : null
    : booking.payment.status === 'PAID'
      ? {
          label: booking.payment.provider === CASH_PROVIDER ? '✅ Pagado (efectivo)' : '✅ Pagado (tarjeta)',
          bg: '#e7f8ef',
          color: '#1f9d55',
        }
      : booking.payment.provider === CASH_PROVIDER
        ? { label: '💵 Pendiente de pago (efectivo)', bg: '#fff3ea', color: 'var(--bingo-coral)' }
        : { label: '💳 Pago con tarjeta pendiente', bg: '#fff3ea', color: 'var(--bingo-coral)' };

  return (
    <>
      <button className="bingo-button secondary small" style={{ marginBottom: 16, width: 'auto' }} onClick={() => router.push('/bookings')}>
        ← Reservas
      </button>

      <header className="dashboard-page-header">
        <div>
          <div className="dashboard-page-title">{booking.service.name}</div>
          <div className="dashboard-page-subtitle">
            <span className="bingo-badge" style={{ background: '#f2f4f7' }}>
              {STATUS_LABELS[booking.status] ?? booking.status}
            </span>
            {isManual && (
              <span className="bingo-badge" style={{ background: '#fff3ea', color: 'var(--bingo-coral)', marginLeft: 6 }}>
                🔒 Bloqueo manual
              </span>
            )}
            {booking.atCustomerHome && (
              <span className="bingo-badge" style={{ background: '#fff3ea', color: 'var(--bingo-coral)', marginLeft: 6 }}>
                🚗 A domicilio del cliente
              </span>
            )}
            {paymentBadge && (
              <span className="bingo-badge" style={{ background: paymentBadge.bg, color: paymentBadge.color, marginLeft: 6 }}>
                {paymentBadge.label}
              </span>
            )}
          </div>
        </div>
      </header>

      {error && <div className="bingo-error-banner" style={{ marginBottom: 14, maxWidth: 640 }}>{error}</div>}

      <div className="dashboard-form-grid" style={{ maxWidth: 640, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#7f8ea3' }}>Cliente</div>
          {isManual || !booking.user ? (
            <div style={{ color: '#7f8ea3' }}>Sin cliente — reserva fuera de la plataforma</div>
          ) : (
            <>
              <div>
                {booking.user.firstName} {booking.user.lastName}
              </div>
              {booking.user.phone && <div style={{ fontSize: 13, color: '#7f8ea3' }}>{booking.user.phone}</div>}
            </>
          )}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#7f8ea3' }}>Mascota</div>
          <div>{booking.pet ? `${booking.pet.name} (${booking.pet.species.name})` : '—'}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#7f8ea3' }}>Fecha y hora</div>
          <div>
            {new Date(booking.date).toLocaleDateString('es-EC')} ·{' '}
            {new Date(booking.startTime).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })} –{' '}
            {new Date(booking.endTime).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
        <div>
          {/* El negocio solo ve lo que le compete: el valor del servicio y su impuesto — nunca la
              tarifa de servicio, que es ingreso de la plataforma, no del negocio (mismo criterio
              que la vista de detalle de un pedido de productos). */}
          <div style={{ fontSize: 12, fontWeight: 700, color: '#7f8ea3' }}>Precio</div>
          <div>{currencyFormatter.format(Number(booking.price))}</div>
          {Number(booking.tax) > 0 && (
            <div style={{ fontSize: 13, color: '#7f8ea3' }}>
              + {currencyFormatter.format(Number(booking.tax))} de impuesto — total{' '}
              {currencyFormatter.format(Number(booking.price) + Number(booking.tax))}
            </div>
          )}
        </div>
        {booking.notes && (
          <div style={{ gridColumn: 'span 2' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#7f8ea3' }}>Notas</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{booking.notes}</div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {canConfirm && (
          <button className="bingo-button" style={{ width: 'auto' }} disabled={busy} onClick={() => runAction('confirm')}>
            Confirmar
          </button>
        )}
        {canComplete && (
          <button className="bingo-button" style={{ width: 'auto' }} disabled={busy} onClick={() => runAction('complete')}>
            Completar
          </button>
        )}
        {canNoShow && (
          <button className="bingo-button secondary" style={{ width: 'auto' }} disabled={busy} onClick={() => runAction('no-show')}>
            Marcar no asistió
          </button>
        )}
        {canMarkCashPaid && (
          <button className="bingo-button" style={{ width: 'auto' }} disabled={busy} onClick={() => runAction('mark-paid')}>
            Marcar como pagado
          </button>
        )}
        {canCancel && !showCancelForm && (
          <button className="bingo-button secondary" style={{ width: 'auto', color: 'var(--bingo-error)' }} disabled={busy} onClick={() => setShowCancelForm(true)}>
            Cancelar reserva
          </button>
        )}
      </div>

      {showCancelForm && (
        <div style={{ marginTop: 16, maxWidth: 480 }}>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Motivo (opcional)</label>
          <input className="bingo-input" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} style={{ marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="bingo-button" style={{ width: 'auto', background: 'var(--bingo-error)' }} disabled={busy} onClick={cancel}>
              Confirmar cancelación
            </button>
            <button className="bingo-button secondary" style={{ width: 'auto' }} onClick={() => setShowCancelForm(false)}>
              Volver
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function BookingDetailPage() {
  return (
    <DashboardShell>
      <BookingDetailContent />
    </DashboardShell>
  );
}
