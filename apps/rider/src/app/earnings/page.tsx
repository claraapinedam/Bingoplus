'use client';

import { useEffect, useState } from 'react';
import RiderShell from '@/components/RiderShell';
import EmptyState from '@/components/EmptyState';
import { apiFetch } from '@/lib/api';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

const TYPE_LABELS: Record<string, string> = {
  DELIVERY_FEE: 'Tarifa de entrega',
  TIP: 'Propina',
  BONUS: 'Bono',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente de pago',
  CONFIRMED: 'Confirmado',
  PAID: 'Pagado',
};

interface Earning {
  id: string;
  grossAmount: string | number;
  netAmount: string | number;
  type: string;
  status: string;
  createdAt: string;
}

export default function EarningsPage() {
  const [earnings, setEarnings] = useState<Earning[] | null>(null);

  useEffect(() => {
    apiFetch<Earning[]>('/rider/earnings').then(setEarnings).catch(() => setEarnings([]));
  }, []);

  const total = (earnings ?? []).reduce((sum, e) => sum + Number(e.netAmount), 0);
  const pending = (earnings ?? []).filter((e) => e.status === 'PENDING').reduce((sum, e) => sum + Number(e.netAmount), 0);

  return (
    <RiderShell>
      <header className="bingo-header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo%20para%20fondo%20osc.png" alt="BINGO+" className="bingo-logo-img" />
        <div className="bingo-header-sub" style={{ marginTop: 4 }}>Ganancias</div>
      </header>
      <div className="bingo-content">
        <div className="bingo-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: '#7f8ea3' }}>Total acumulado</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{currencyFormatter.format(total)}</div>
          <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 4 }}>
            {currencyFormatter.format(pending)} pendiente de pago
          </div>
        </div>

        <p style={{ fontSize: 11, color: '#9aa5b1', textAlign: 'center', marginTop: 8 }}>
          Los pagos a riders aún no están automatizados — esto es un resumen informativo.
        </p>

        <h2 className="bingo-section-title">Detalle</h2>
        {earnings === null ? (
          <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
        ) : earnings.length === 0 ? (
          <EmptyState title="Aún no tienes ganancias" subtitle="Completa entregas para empezar a ganar." />
        ) : (
          earnings.map((e) => (
            <div key={e.id} className="bingo-card" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{TYPE_LABELS[e.type] ?? e.type}</div>
                <div style={{ fontSize: 11, color: '#9aa5b1', marginTop: 2 }}>
                  {new Date(e.createdAt).toLocaleDateString('es-EC', { day: 'numeric', month: 'short', year: 'numeric' })} ·{' '}
                  {STATUS_LABELS[e.status] ?? e.status}
                </div>
              </div>
              <span style={{ fontWeight: 800, fontSize: 14 }}>{currencyFormatter.format(Number(e.netAmount))}</span>
            </div>
          ))
        )}
      </div>
    </RiderShell>
  );
}
