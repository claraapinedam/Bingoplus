'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CustomerShell from '@/components/CustomerShell';
import EmptyState from '@/components/EmptyState';
import { apiFetch } from '@/lib/api';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmada',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'No asistió',
};

interface BookingSummary {
  id: string;
  status: string;
  startTime: string;
  price: string | number;
  service: { name: string };
  business: { tradeName: string };
  pet: { name: string } | null;
}

const TABS = [
  { value: 'upcoming', label: 'Próximas' },
  { value: 'history', label: 'Historial' },
  { value: 'cancelled', label: 'Canceladas' },
] as const;

export default function BookingsPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<BookingSummary[] | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]['value']>('upcoming');

  useEffect(() => {
    apiFetch<BookingSummary[]>('/me/bookings').then(setBookings).catch(() => setBookings([]));
  }, []);

  const filtered = (bookings ?? []).filter((b) => {
    if (tab === 'upcoming') return b.status === 'PENDING' || b.status === 'CONFIRMED';
    if (tab === 'cancelled') return b.status === 'CANCELLED' || b.status === 'NO_SHOW';
    return b.status === 'COMPLETED';
  });

  return (
    <CustomerShell>
      <header className="bingo-header">
        <button className="bingo-button secondary small" style={{ marginBottom: 10 }} onClick={() => router.back()}>
          ← Volver
        </button>
        <div className="bingo-logo" style={{ fontSize: 18 }}>
          Mis reservas
        </div>
      </header>

      <div className="bingo-content">
        <div className="bingo-chip-row" style={{ marginBottom: 12 }}>
          {TABS.map((t) => (
            <button key={t.value} className={`bingo-chip${tab === t.value ? ' active' : ''}`} onClick={() => setTab(t.value)}>
              {t.label}
            </button>
          ))}
        </div>

        {bookings === null ? (
          <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
        ) : filtered.length === 0 ? (
          <EmptyState title="No tienes reservas" subtitle="Cuando reserves un servicio, aparecerá aquí." />
        ) : (
          filtered.map((b) => (
            <a key={b.id} href={`/bookings/${b.id}`} className="bingo-card" style={{ display: 'block', marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{b.service.name}</div>
                  <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 2 }}>{b.business.tradeName}</div>
                  <div style={{ fontSize: 11, color: '#9aa5b1', marginTop: 2 }}>
                    {new Date(b.startTime).toLocaleString('es-EC', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    {b.pet ? ` · ${b.pet.name}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>${Number(b.price).toFixed(2)}</div>
                  <span className="bingo-badge" style={{ marginTop: 4, background: '#f2f4f7' }}>
                    {STATUS_LABELS[b.status] ?? b.status}
                  </span>
                </div>
              </div>
            </a>
          ))
        )}
      </div>
    </CustomerShell>
  );
}
