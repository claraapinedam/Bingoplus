'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetchPage } from '@/lib/api';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

const STATUS_TABS = [
  { value: '', label: 'Todas' },
  { value: 'PENDING', label: 'Pendientes' },
  { value: 'CONFIRMED', label: 'Confirmadas' },
  { value: 'COMPLETED', label: 'Completadas' },
  { value: 'CANCELLED', label: 'Canceladas' },
  { value: 'NO_SHOW', label: 'No asistió' },
];

interface BookingRow {
  id: string;
  status: string;
  startTime: string;
  price: string | number;
  service: { name: string };
  user: { firstName: string; lastName: string };
  pet: { name: string } | null;
}

export default function BookingsTab({ businessId }: { businessId: string }) {
  const [status, setStatus] = useState('');
  const [bookings, setBookings] = useState<BookingRow[] | null>(null);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ pageSize: '100', businessId });
    if (status) params.set('status', status);
    const result = await apiFetchPage<BookingRow>(`/admin/bookings?${params}`);
    setBookings(result.data);
    setTotal(result.meta.total);
  }, [businessId, status]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <p style={{ fontSize: 13, color: '#7f8ea3', marginBottom: 14 }}>
        {total} reserva(s) — solo lectura, Customer y Business gestionan sus propias reservas.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {STATUS_TABS.map((t) => (
          <button key={t.value} onClick={() => setStatus(t.value)} className={`bingo-button ${status === t.value ? '' : 'secondary'}`} style={{ padding: '8px 14px', fontSize: 13 }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bingo-card">
        {bookings === null ? (
          <p>Cargando…</p>
        ) : bookings.length === 0 ? (
          <p>No hay reservas en este filtro.</p>
        ) : (
          <table className="bingo-table">
            <thead>
              <tr>
                <th>Servicio</th>
                <th>Cliente</th>
                <th>Mascota</th>
                <th>Fecha</th>
                <th>Precio</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} onClick={() => (window.location.href = `/bookings/${b.id}`)} style={{ cursor: 'pointer' }}>
                  <td>{b.service.name}</td>
                  <td>
                    {b.user.firstName} {b.user.lastName}
                  </td>
                  <td>{b.pet?.name ?? '—'}</td>
                  <td style={{ fontSize: 12 }}>{new Date(b.startTime).toLocaleString('es-EC')}</td>
                  <td>{currencyFormatter.format(Number(b.price))}</td>
                  <td>
                    <span className={`bingo-badge badge-${b.status.toLowerCase()}`}>{b.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
