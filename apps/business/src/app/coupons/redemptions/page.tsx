'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';
import EmptyState from '@/components/EmptyState';
import { apiFetch, getActiveBusinessId } from '@/lib/api';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

interface Redemption {
  id: string;
  redeemedAt: string;
  discountAmount: string | number;
  purchaseAmount: string | number | null;
  coupon: { code: string; title: string };
}

function RedemptionsContent() {
  const router = useRouter();
  const businessId = getActiveBusinessId();
  const [redemptions, setRedemptions] = useState<Redemption[] | null>(null);

  useEffect(() => {
    if (!businessId) return;
    apiFetch<Redemption[]>(`/me/business/${businessId}/coupons/redemptions`)
      .then(setRedemptions)
      .catch(() => setRedemptions([]));
  }, [businessId]);

  return (
    <>
      <button className="bingo-button secondary small" style={{ marginBottom: 16, width: 'auto' }} onClick={() => router.push('/coupons')}>
        ← Cupones
      </button>
      <header className="dashboard-page-header">
        <div className="dashboard-page-title">Redenciones de cupones</div>
      </header>

      {redemptions === null ? (
        <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
      ) : redemptions.length === 0 ? (
        <EmptyState title="Sin redenciones todavía" />
      ) : (
        <div className="dashboard-table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Cupón</th>
                <th>Fecha</th>
                <th>Descuento</th>
                <th>Compra</th>
              </tr>
            </thead>
            <tbody>
              {redemptions.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 700 }}>
                    {r.coupon.code} — {r.coupon.title}
                  </td>
                  <td>{new Date(r.redeemedAt).toLocaleString('es-EC')}</td>
                  <td>{currencyFormatter.format(Number(r.discountAmount))}</td>
                  <td>{r.purchaseAmount != null ? currencyFormatter.format(Number(r.purchaseAmount)) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function RedemptionsPage() {
  return (
    <DashboardShell>
      <RedemptionsContent />
    </DashboardShell>
  );
}
