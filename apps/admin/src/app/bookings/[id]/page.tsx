'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminShell from '@/components/AdminShell';
import { apiFetch, ApiError } from '@/lib/api';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

interface BookingDetail {
  id: string;
  status: string;
  date: string;
  startTime: string;
  endTime: string;
  price: string | number;
  notes: string | null;
  service: { name: string; type: string };
  pet: { name: string; species: { name: string } } | null;
  business: { id: string; tradeName: string; city: string; addressLine: string };
  user: { id: string; firstName: string; lastName: string; phone: string | null };
}

export default function AdminBookingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [booking, setBooking] = useState<BookingDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<BookingDetail>(`/admin/bookings/${params.id}`)
      .then(setBooking)
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'No se pudo cargar la reserva.');
        setBooking(null);
      });
  }, [params.id]);

  if (booking === undefined) {
    return (
      <AdminShell>
        <p>Cargando…</p>
      </AdminShell>
    );
  }
  if (!booking) {
    return (
      <AdminShell>
        <div className="bingo-card" style={{ color: 'var(--bingo-error)' }}>{error ?? 'Reserva no encontrada.'}</div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <button className="bingo-button secondary" style={{ marginBottom: 16, padding: '8px 14px', fontSize: 13 }} onClick={() => router.back()}>
        ← Volver
      </button>

      <h1 className="bingo-page-title">{booking.service.name}</h1>
      <p className="bingo-page-subtitle">
        <a href={`/businesses/${booking.business.id}`}>{booking.business.tradeName}</a> ·{' '}
        <span className={`bingo-badge badge-${booking.status.toLowerCase()}`}>{booking.status}</span>
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="bingo-card">
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>Cliente</h2>
          <div style={{ fontSize: 13, marginBottom: 6 }}>
            <a href={`/customers/${booking.user.id}`}>
              {booking.user.firstName} {booking.user.lastName}
            </a>
          </div>
          {booking.user.phone && <div style={{ fontSize: 13 }}>{booking.user.phone}</div>}
        </div>

        <div className="bingo-card">
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>Mascota</h2>
          <div style={{ fontSize: 13 }}>{booking.pet ? `${booking.pet.name} (${booking.pet.species.name})` : '—'}</div>
        </div>

        <div className="bingo-card">
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>Fecha y hora</h2>
          <div style={{ fontSize: 13, marginBottom: 6 }}>{new Date(booking.date).toLocaleDateString('es-EC')}</div>
          <div style={{ fontSize: 13 }}>
            {new Date(booking.startTime).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })} –{' '}
            {new Date(booking.endTime).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>

        <div className="bingo-card">
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>Precio</h2>
          <div style={{ fontSize: 13 }}>{currencyFormatter.format(Number(booking.price))}</div>
        </div>

        {booking.notes && (
          <div className="bingo-card" style={{ gridColumn: 'span 2' }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>Notas</h2>
            <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{booking.notes}</div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
