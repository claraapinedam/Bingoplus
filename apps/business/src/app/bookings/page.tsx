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
  const [date, setDate] = useState(todayString());
  const [status, setStatus] = useState('');
  const [bookings, setBookings] = useState<BookingRow[] | null>(null);

  const load = useCallback(() => {
    if (!businessId) return;
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (status) params.set('status', status);
    apiFetch<BookingRow[]>(`/business/${businessId}/bookings?${params}`)
      .then(setBookings)
      .catch(() => setBookings([]));
  }, [businessId, date, status]);

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

      <div className="dashboard-toolbar">
        <input className="bingo-input" type="date" style={{ maxWidth: 200 }} value={date} onChange={(e) => setDate(e.target.value)} />
        <button className="bingo-chip" onClick={() => setDate(todayString())}>
          Hoy
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
