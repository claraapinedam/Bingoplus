'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardShell, { useBusiness } from '@/components/DashboardShell';
import EmptyState from '@/components/EmptyState';
import { apiFetch, getActiveBusinessId } from '@/lib/api';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  ACTIVE: 'Activo',
  PAUSED: 'Pausado',
  EXPIRED: 'Expirado',
  CANCELLED: 'Cancelado',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#7f8ea3',
  ACTIVE: 'var(--bingo-success)',
  PAUSED: 'var(--bingo-warning)',
  EXPIRED: '#9aa5b1',
  CANCELLED: 'var(--bingo-error)',
};

interface Coupon {
  id: string;
  code: string;
  title: string;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: string | number;
  status: string;
  startDate: string;
  expirationDate: string;
  usageLimit: number | null;
}

function CouponsContent() {
  const router = useRouter();
  const { business } = useBusiness();
  const businessId = getActiveBusinessId();
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);

  const load = useCallback(() => {
    if (!businessId) return;
    apiFetch<Coupon[]>(`/me/business/${businessId}/coupons`)
      .then(setCoupons)
      .catch(() => setCoupons([]));
  }, [businessId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!business.capabilities.COUPONS) {
    return <EmptyState title="Esta sección no está disponible" subtitle="Tu negocio no tiene habilitados los cupones." />;
  }

  return (
    <>
      <header className="dashboard-page-header">
        <div>
          <div className="dashboard-page-title">Cupones</div>
          <div className="dashboard-page-subtitle">{coupons?.length ?? 0} cupón(es)</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="bingo-button secondary" style={{ width: 'auto' }} onClick={() => router.push('/coupons/redemptions')}>
            Ver redenciones
          </button>
          <button className="bingo-button" style={{ width: 'auto' }} onClick={() => router.push('/coupons/new')}>
            + Crear cupón
          </button>
        </div>
      </header>

      {coupons === null ? (
        <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
      ) : coupons.length === 0 ? (
        <EmptyState title="No hay cupones" subtitle="Crea tu primer cupón para atraer clientes." />
      ) : (
        <div className="dashboard-table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Título</th>
                <th>Descuento</th>
                <th>Vigencia</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id} onClick={() => router.push(`/coupons/${c.id}`)}>
                  <td style={{ fontWeight: 700 }}>{c.code}</td>
                  <td>{c.title}</td>
                  <td>{c.discountType === 'PERCENTAGE' ? `${c.discountValue}%` : `$${c.discountValue}`}</td>
                  <td>
                    {new Date(c.startDate).toLocaleDateString('es-EC')} – {new Date(c.expirationDate).toLocaleDateString('es-EC')}
                  </td>
                  <td>
                    <span className="bingo-badge" style={{ background: '#f2f4f7', color: STATUS_COLORS[c.status] ?? '#54617a' }}>
                      {STATUS_LABELS[c.status] ?? c.status}
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

export default function CouponsPage() {
  return (
    <DashboardShell>
      <CouponsContent />
    </DashboardShell>
  );
}
