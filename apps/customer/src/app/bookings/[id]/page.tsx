'use client';

import { useCallback, useEffect, useState } from 'react';
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

interface BookingDetail {
  id: string;
  status: string;
  date: string;
  startTime: string;
  endTime: string;
  price: string | number;
  notes: string | null;
  service: { name: string; description: string | null };
  pet: { name: string } | null;
  business: { tradeName: string; city: string; addressLine: string; phone: string | null };
}

export default function BookingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [booking, setBooking] = useState<BookingDetail | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
              <strong>Ubicación:</strong> {booking.business.addressLine}, {booking.business.city}
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
              <strong>Precio:</strong> ${Number(booking.price).toFixed(2)}
            </div>
            {booking.notes && (
              <div>
                <strong>Notas:</strong> {booking.notes}
              </div>
            )}
          </div>
        </div>

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
