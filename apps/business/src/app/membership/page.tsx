'use client';

import { useEffect, useState } from 'react';
import DashboardShell from '@/components/DashboardShell';
import EmptyState from '@/components/EmptyState';
import { apiFetch, getActiveBusinessId } from '@/lib/api';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

const STATUS_LABELS: Record<string, string> = {
  TRIAL: 'Prueba gratuita',
  ACTIVE: 'Activa',
  PAST_DUE: 'Pago pendiente',
  PAUSED: 'Pausada',
  CANCELLED: 'Cancelada',
  EXPIRED: 'Expirada',
};

const STATUS_COLORS: Record<string, string> = {
  TRIAL: 'var(--bingo-teal)',
  ACTIVE: 'var(--bingo-success)',
  PAST_DUE: 'var(--bingo-error)',
  PAUSED: 'var(--bingo-warning)',
  CANCELLED: '#9aa5b1',
  EXPIRED: '#9aa5b1',
};

interface Subscription {
  id: string;
  periodStart: string;
  periodEnd: string;
  amount: string | number;
  currency: string;
  status: string;
}

interface Membership {
  status: string;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  plan: { name: string; price: string | number; currency: string; billingFrequency: string; benefits: Record<string, unknown> | null };
  subscriptions: Subscription[];
}

function MembershipContent() {
  const businessId = getActiveBusinessId();
  const [membership, setMembership] = useState<Membership | null | undefined>(undefined);

  useEffect(() => {
    if (!businessId) return;
    apiFetch<Membership | null>(`/me/business/${businessId}/membership`)
      .then(setMembership)
      .catch(() => setMembership(null));
  }, [businessId]);

  return (
    <>
      <header className="dashboard-page-header">
        <div className="dashboard-page-title">Membresía</div>
      </header>

      {membership === undefined ? (
        <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
      ) : !membership ? (
        <EmptyState title="Sin membresía todavía" subtitle="Tu negocio aún no tiene una membresía asignada." />
      ) : (
        <>
          <div className="bingo-card" style={{ maxWidth: 480 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{membership.plan.name}</div>
              <span className="bingo-badge" style={{ background: '#f2f4f7', color: STATUS_COLORS[membership.status] ?? '#54617a' }}>
                {STATUS_LABELS[membership.status] ?? membership.status}
              </span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 8 }}>
              {currencyFormatter.format(Number(membership.plan.price))}
              <span style={{ fontSize: 12, fontWeight: 600, color: '#7f8ea3' }}>
                {' '}
                / {membership.plan.billingFrequency === 'MONTHLY' ? 'mes' : 'año'}
              </span>
            </div>
            {membership.trialEndsAt && (
              <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 8 }}>
                Prueba gratuita hasta {new Date(membership.trialEndsAt).toLocaleDateString('es-EC')}
              </div>
            )}
            {membership.currentPeriodEnd && (
              <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 4 }}>
                Próxima renovación: {new Date(membership.currentPeriodEnd).toLocaleDateString('es-EC')}
              </div>
            )}
          </div>

          <h2 className="bingo-section-title">Historial de facturación</h2>
          {membership.subscriptions.length === 0 ? (
            <EmptyState title="Sin períodos de facturación todavía" />
          ) : (
            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Período</th>
                    <th>Monto</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {membership.subscriptions.map((s) => (
                    <tr key={s.id}>
                      <td>
                        {new Date(s.periodStart).toLocaleDateString('es-EC')} – {new Date(s.periodEnd).toLocaleDateString('es-EC')}
                      </td>
                      <td>{currencyFormatter.format(Number(s.amount))}</td>
                      <td>
                        <span className="bingo-badge" style={{ background: '#f2f4f7', color: STATUS_COLORS[s.status] ?? '#54617a' }}>
                          {STATUS_LABELS[s.status] ?? s.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}

export default function MembershipPage() {
  return (
    <DashboardShell>
      <MembershipContent />
    </DashboardShell>
  );
}
