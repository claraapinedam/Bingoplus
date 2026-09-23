'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardShell, { useBusiness } from '@/components/DashboardShell';
import EmptyState from '@/components/EmptyState';
import { apiFetch, getActiveBusinessId } from '@/lib/api';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmada',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'No asistió',
};

// Never `.toISOString()` — that converts to UTC first, which silently rolls "today" over to
// tomorrow once local time passes UTC midnight (e.g. 19:00+ in Ecuador's UTC-5), even though it's
// still today locally.
function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface BookingRow {
  id: string;
  status: string;
  startTime: string;
  endTime: string;
  price: string | number;
  service: { name: string };
  pet: { name: string } | null;
  user: { firstName: string; lastName: string; phone: string | null };
  atCustomerHome: boolean;
}

function BookingsContent() {
  const router = useRouter();
  const { business } = useBusiness();
  const businessId = getActiveBusinessId();
  // Defaulting to "today only" was how a booking made today for a later date went unnoticed —
  // defaulting to "from today onward, no end date" instead means nothing upcoming is ever hidden
  // just because it happened to be filtered out on first load.
  const [from, setFrom] = useState(todayString());
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');
  const [bookings, setBookings] = useState<BookingRow[] | null>(null);

  const load = useCallback(() => {
    if (!businessId) return;
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (status) params.set('status', status);
    apiFetch<BookingRow[]>(`/business/${businessId}/bookings?${params}`)
      .then(setBookings)
      .catch(() => setBookings([]));
  }, [businessId, from, to, status]);

  useEffect(() => {
    load();
  }, [load]);

  if (!business.capabilities.BOOKINGS) {
    return <EmptyState title="Esta sección no está disponible" subtitle="Tu negocio no tiene habilitadas las reservas." />;
  }

  return (
    <>
      <header className="dashboard-page-header">
        <div>
          <div className="dashboard-page-title">Reservas</div>
          <div className="dashboard-page-subtitle">Agenda del negocio</div>
        </div>
      </header>

      <div className="dashboard-toolbar" style={{ flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, color: '#7f8ea3', display: 'flex', alignItems: 'center', gap: 6 }}>
          Desde
          <input className="bingo-input" type="date" style={{ maxWidth: 170 }} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label style={{ fontSize: 12, color: '#7f8ea3', display: 'flex', alignItems: 'center', gap: 6 }}>
          Hasta
          <input className="bingo-input" type="date" style={{ maxWidth: 170 }} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button
          className="bingo-chip"
          onClick={() => {
            setFrom(todayString());
            setTo(todayString());
          }}
        >
          Solo hoy
        </button>
        <button
          className="bingo-chip"
          onClick={() => {
            setFrom('');
            setTo('');
          }}
        >
          Todas las fechas
        </button>
        <div className="bingo-chip-row">
          {[{ value: '', label: 'Todas' }, ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))].map((t) => (
            <button key={t.value} className={`bingo-chip${status === t.value ? ' active' : ''}`} onClick={() => setStatus(t.value)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {bookings === null ? (
        <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
      ) : bookings.length === 0 ? (
        <EmptyState title="No tienes reservas" subtitle="No hay reservas para este filtro." />
      ) : (
        <div className="dashboard-table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Hora</th>
                <th>Servicio</th>
                <th>Cliente</th>
                <th>Mascota</th>
                <th>Precio</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} onClick={() => router.push(`/bookings/${b.id}`)}>
                  <td>{new Date(b.startTime).toLocaleDateString('es-EC', { day: 'numeric', month: 'short' })}</td>
                  <td style={{ fontWeight: 700 }}>
                    {new Date(b.startTime).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td>
                    {b.service.name}
                    {b.atCustomerHome && <span title="A domicilio del cliente" style={{ marginLeft: 6 }}>🚗</span>}
                  </td>
                  <td>
                    {b.user.firstName} {b.user.lastName}
                  </td>
                  <td>{b.pet?.name ?? '—'}</td>
                  <td>${Number(b.price).toFixed(2)}</td>
                  <td>
                    <span className="bingo-badge" style={{ background: '#f2f4f7' }}>
                      {STATUS_LABELS[b.status] ?? b.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function BookingsPage() {
  return (
    <DashboardShell>
      <BookingsContent />
    </DashboardShell>
  );
}
