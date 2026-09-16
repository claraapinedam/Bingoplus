'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });
const percentFormatter = new Intl.NumberFormat('es-EC', { style: 'percent', minimumFractionDigits: 1 });

interface Summary {
  salesCount: number;
  gmv: number;
  commissionRate: number | null;
  estimatedRevenue: number | null;
}

interface CommissionHistoryRow {
  id: string;
  rate: string | number;
  effectiveFrom: string;
  createdBy: string | null;
}

export default function CommissionsTab({ businessId }: { businessId: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [history, setHistory] = useState<CommissionHistoryRow[] | null>(null);

  useEffect(() => {
    apiFetch<Summary>(`/admin/businesses/${businessId}/commissions/summary`).then(setSummary).catch(() => setSummary(null));
    apiFetch<CommissionHistoryRow[]>(`/admin/businesses/${businessId}/commissions`).then(setHistory).catch(() => setHistory([]));
  }, [businessId]);

  return (
    <div>
      <p style={{ fontSize: 13, color: '#7f8ea3', marginBottom: 14 }}>
        GMV real (ventas ya registradas, sin cancelaciones) × tasa de comisión vigente. Dominio financiero de
        Marketplace, separado de la facturación de Membresía.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14, marginBottom: 20 }}>
        <div className="bingo-card">
          <div style={{ fontSize: 20, fontWeight: 800 }}>{summary ? currencyFormatter.format(summary.gmv) : '—'}</div>
          <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 4 }}>GMV total</div>
        </div>
        <div className="bingo-card">
          <div style={{ fontSize: 20, fontWeight: 800 }}>{summary?.salesCount ?? '—'}</div>
          <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 4 }}>Ventas</div>
        </div>
        <div className="bingo-card">
          <div style={{ fontSize: 20, fontWeight: 800 }}>
            {summary?.commissionRate != null ? percentFormatter.format(summary.commissionRate) : '—'}
          </div>
          <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 4 }}>Tasa vigente</div>
        </div>
        <div className="bingo-card">
          <div style={{ fontSize: 20, fontWeight: 800 }}>
            {summary?.estimatedRevenue != null ? currencyFormatter.format(summary.estimatedRevenue) : '—'}
          </div>
          <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 4 }}>Ingreso estimado</div>
        </div>
      </div>

      <div className="bingo-card">
        <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>Historial de tasas</h2>
        {history === null ? (
          <p>Cargando…</p>
        ) : history.length === 0 ? (
          <p style={{ fontSize: 13, color: '#7f8ea3' }}>Sin cambios de tasa registrados (nunca aprobado con una tasa asignada).</p>
        ) : (
          <table className="bingo-table">
            <thead>
              <tr>
                <th>Tasa</th>
                <th>Vigente desde</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{percentFormatter.format(Number(h.rate))}</td>
                  <td>{new Date(h.effectiveFrom).toLocaleString('es-EC')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
