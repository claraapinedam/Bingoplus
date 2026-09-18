'use client';

import { useEffect, useState } from 'react';
import RiderShell from '@/components/RiderShell';
import EmptyState from '@/components/EmptyState';
import { apiFetch } from '@/lib/api';
import { DELIVERY_STATUS_COLORS, DELIVERY_STATUS_LABELS } from '@/lib/deliveryStatus';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

interface DeliverySummary {
  id: string;
  status: string;
  deliveryFee: string | number;
  createdAt: string;
  pickupAddressSnapshot: { tradeName?: string };
  order: { orderNumber: string };
}

const TERMINAL = ['DELIVERED', 'CANCELLED', 'FAILED'];

export default function HistoryPage() {
  const [deliveries, setDeliveries] = useState<DeliverySummary[] | null>(null);

  useEffect(() => {
    apiFetch<DeliverySummary[]>('/rider/deliveries').then(setDeliveries).catch(() => setDeliveries([]));
  }, []);

  const finished = deliveries?.filter((d) => TERMINAL.includes(d.status)) ?? [];

  return (
    <RiderShell>
      <header className="bingo-header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo%20para%20fondo%20osc.png" alt="BINGO+" className="bingo-logo-img" />
        <div className="bingo-header-sub" style={{ marginTop: 4 }}>Historial</div>
      </header>
      <div className="bingo-content">
        {deliveries === null ? (
          <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
        ) : finished.length === 0 ? (
          <EmptyState title="Aún no tienes entregas" subtitle="Cuando completes una, aparecerá aquí." />
        ) : (
          finished.map((d) => (
            <a
              key={d.id}
              href={`/deliveries/${d.id}`}
              className="bingo-card"
              style={{ display: 'block', marginBottom: 10 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{d.pickupAddressSnapshot.tradeName ?? 'Negocio'}</div>
                  <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 2 }}>{d.order.orderNumber}</div>
                  <div style={{ fontSize: 11, color: '#9aa5b1', marginTop: 2 }}>
                    {new Date(d.createdAt).toLocaleDateString('es-EC', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{currencyFormatter.format(Number(d.deliveryFee))}</div>
                  <span
                    className="bingo-badge"
                    style={{ marginTop: 4, background: '#f2f4f7', color: DELIVERY_STATUS_COLORS[d.status] ?? '#54617a' }}
                  >
                    {DELIVERY_STATUS_LABELS[d.status] ?? d.status}
                  </span>
                </div>
              </div>
            </a>
          ))
        )}
      </div>
    </RiderShell>
  );
}
