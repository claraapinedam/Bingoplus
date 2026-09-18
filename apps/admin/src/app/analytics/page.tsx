'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import DateRangeFilter, { DateRangeFilterValue } from '@/components/DateRangeFilter';
import DonutChart from '@/components/DonutChart';
import { apiFetch, decodeRoles, getAccessToken } from '@/lib/api';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

const ORDER_STATUS_LABELS: Record<string, string> = {
  CREATED: 'Creado',
  PAYMENT_PENDING: 'Pago pendiente',
  PAID: 'Pagado',
  CONFIRMED: 'Confirmado',
  PREPARING: 'Preparando',
  READY_FOR_PICKUP: 'Listo para retiro',
  COMPLETED: 'Completado',
  CANCELLED: 'Cancelado',
};

const ORDER_STATUS_COLORS: Record<string, string> = {
  CREATED: '#c7cdd6',
  PAYMENT_PENDING: '#f5a524',
  PAID: '#16a085',
  CONFIRMED: '#4b8bf5',
  PREPARING: '#f5a524',
  READY_FOR_PICKUP: '#8b5cf6',
  COMPLETED: '#22a06b',
  CANCELLED: '#d64545',
};

const BUSINESS_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  UNDER_REVIEW: 'En revisión',
  APPROVED: 'Aprobado (sin firmar)',
  ACTIVE: 'Activo',
  SUSPENDED: 'Suspendido',
  REJECTED: 'Rechazado',
};

const BUSINESS_STATUS_COLORS: Record<string, string> = {
  PENDING: '#c7cdd6',
  UNDER_REVIEW: '#f5a524',
  APPROVED: '#4b8bf5',
  ACTIVE: '#22a06b',
  SUSPENDED: '#e08b3f',
  REJECTED: '#d64545',
};

interface AdminAnalytics {
  marketplace: {
    gmv: number;
    ordersCount: number;
    averageTicket: number;
    estimatedCommissionRevenue: number;
    discountsGranted: number;
    ordersByStatus: { status: string; count: number }[];
    deliveryVsPickup: { delivery: number; pickup: number };
  };
  directory: {
    businessesByStatus: { status: string; count: number }[];
    activeMemberships: number;
    trialMemberships: number;
    cancelledMembershipsTotal: number;
    activeMembershipValue: number;
    trialMembershipValue: number;
  };
  delivery: {
    deliveriesCount: number;
    completedDeliveries: number;
    cancelledDeliveries: number;
    failedDeliveries: number;
    inProgressDeliveries: number;
    averageDurationMinutes: number | null;
    averageDistanceKm: number | null;
    revenue: number;
  };
  platformCoupons: {
    active: number;
    totalCapacity: number;
    totalRedeemed: number;
  };
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bingo-card">
      <div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 4 }}>{label}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12, color: 'var(--bingo-navy)' }}>{title}</h2>
      {children}
    </section>
  );
}

export default function AdminAnalyticsPage() {
  const [range, setRange] = useState<DateRangeFilterValue>({ preset: 'last_30_days' });
  const [data, setData] = useState<AdminAnalytics | null>(null);
  // Defense in depth only — the backend's RolesGuard is the real gate (AdminAnalyticsController
  // never grants RoleName.USER). This just avoids a USER account hitting an infinite "Cargando…"
  // if they type the URL directly, since AdminShell's nav already hides the link to it.
  const [restricted, setRestricted] = useState(false);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (range.preset) params.set('preset', range.preset);
    if (range.from) params.set('from', range.from);
    if (range.to) params.set('to', range.to);
    apiFetch<AdminAnalytics>(`/admin/analytics?${params}`).then(setData).catch(() => setData(null));
  }, [range]);

  useEffect(() => {
    const token = getAccessToken();
    const roles = token ? decodeRoles(token) : [];
    setRestricted(roles.includes('USER') && !roles.includes('ADMIN') && !roles.includes('SUPER_ADMIN'));
  }, []);

  useEffect(() => {
    if (!restricted) load();
  }, [load, restricted]);

  if (restricted) {
    return (
      <AdminShell>
        <h1 className="bingo-page-title">Analíticas</h1>
        <div className="bingo-card" style={{ color: 'var(--bingo-error)' }}>Tu cuenta no tiene acceso a esta sección.</div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <h1 className="bingo-page-title" style={{ marginBottom: 20 }}>Analíticas</h1>

      <DateRangeFilter value={range} onChange={setRange} />

      {data === null ? (
        <p>Cargando…</p>
      ) : (
        <>
          <Section title="Marketplace">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
              <Kpi label="GMV" value={currencyFormatter.format(data.marketplace.gmv)} />
              <Kpi label="Ticket promedio" value={currencyFormatter.format(data.marketplace.averageTicket)} />
              <Kpi label="Comisión estimada" value={currencyFormatter.format(data.marketplace.estimatedCommissionRevenue)} />
              <Kpi label="Descuentos otorgados" value={currencyFormatter.format(data.marketplace.discountsGranted)} />
            </div>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div className="bingo-card" style={{ flex: '1 1 320px' }}>
                <h3 style={{ fontSize: 13, fontWeight: 800, margin: '0 0 14px', color: 'var(--bingo-navy)' }}>Pedidos por estado</h3>
                <DonutChart
                  centerValue={data.marketplace.ordersCount}
                  centerLabel="pedidos"
                  slices={data.marketplace.ordersByStatus.map((s) => ({
                    label: ORDER_STATUS_LABELS[s.status] ?? s.status,
                    value: s.count,
                    color: ORDER_STATUS_COLORS[s.status] ?? '#9aa5b1',
                  }))}
                />
              </div>
              <div className="bingo-card" style={{ flex: '1 1 320px' }}>
                <h3 style={{ fontSize: 13, fontWeight: 800, margin: '0 0 14px', color: 'var(--bingo-navy)' }}>Delivery vs. retiro en tienda</h3>
                <DonutChart
                  centerValue={data.marketplace.deliveryVsPickup.delivery + data.marketplace.deliveryVsPickup.pickup}
                  centerLabel="pedidos"
                  slices={[
                    { label: 'Delivery', value: data.marketplace.deliveryVsPickup.delivery, color: '#16a085' },
                    { label: 'Retiro en tienda', value: data.marketplace.deliveryVsPickup.pickup, color: '#4b8bf5' },
                  ]}
                />
              </div>
            </div>
          </Section>

          <Section title="Directorio">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
              <Kpi label="Valor activo en membresías" value={currencyFormatter.format(data.directory.activeMembershipValue)} />
              <Kpi label="Valor en trial (no confirmado)" value={currencyFormatter.format(data.directory.trialMembershipValue)} />
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div className="bingo-card" style={{ flex: '1 1 320px' }}>
                <h3 style={{ fontSize: 13, fontWeight: 800, margin: '0 0 14px', color: 'var(--bingo-navy)' }}>Negocios por estado</h3>
                <DonutChart
                  centerValue={data.directory.businessesByStatus.reduce((sum, s) => sum + s.count, 0)}
                  centerLabel="negocios"
                  slices={data.directory.businessesByStatus.map((s) => ({
                    label: BUSINESS_STATUS_LABELS[s.status] ?? s.status,
                    value: s.count,
                    color: BUSINESS_STATUS_COLORS[s.status] ?? '#9aa5b1',
                  }))}
                />
              </div>
              <div className="bingo-card" style={{ flex: '1 1 320px' }}>
                <h3 style={{ fontSize: 13, fontWeight: 800, margin: '0 0 14px', color: 'var(--bingo-navy)' }}>Membresías por estado</h3>
                <DonutChart
                  centerValue={data.directory.activeMemberships + data.directory.cancelledMembershipsTotal + data.directory.trialMemberships}
                  centerLabel="membresías"
                  slices={[
                    { label: 'Activas (pagando)', value: data.directory.activeMemberships, color: '#22a06b' },
                    { label: 'Gratuitas (trial)', value: data.directory.trialMemberships, color: '#4b8bf5' },
                    { label: 'Canceladas', value: data.directory.cancelledMembershipsTotal, color: '#d64545' },
                  ]}
                />
              </div>
            </div>
          </Section>

          <Section title="Cupones de Plataforma">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
              <Kpi label="Cupones activos" value={data.platformCoupons.active} />
            </div>
            {data.platformCoupons.totalCapacity > 0 && (
              <div className="bingo-card" style={{ maxWidth: 420 }}>
                <h3 style={{ fontSize: 13, fontWeight: 800, margin: '0 0 14px', color: 'var(--bingo-navy)' }}>
                  Uso de cupones activos (de {data.platformCoupons.totalCapacity} disponibles)
                </h3>
                <DonutChart
                  centerValue={data.platformCoupons.totalRedeemed}
                  centerLabel="redimidos"
                  slices={[
                    { label: 'Redimidos', value: data.platformCoupons.totalRedeemed, color: '#4b8bf5' },
                    {
                      label: 'Disponibles',
                      value: Math.max(data.platformCoupons.totalCapacity - data.platformCoupons.totalRedeemed, 0),
                      color: '#e0e4ea',
                    },
                  ]}
                />
              </div>
            )}
          </Section>

          <Section title="Delivery">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
              <Kpi label="Ingresos por delivery" value={currencyFormatter.format(data.delivery.revenue)} />
              <Kpi label="Duración promedio" value={data.delivery.averageDurationMinutes != null ? `${data.delivery.averageDurationMinutes} min` : '—'} />
              <Kpi label="Distancia promedio" value={data.delivery.averageDistanceKm != null ? `${data.delivery.averageDistanceKm} km` : '—'} />
            </div>
            <div className="bingo-card" style={{ maxWidth: 420 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, margin: '0 0 14px', color: 'var(--bingo-navy)' }}>Entregas por estado</h3>
              <DonutChart
                centerValue={data.delivery.deliveriesCount}
                centerLabel="entregas"
                slices={[
                  { label: 'Completadas', value: data.delivery.completedDeliveries, color: '#22a06b' },
                  { label: 'En curso', value: data.delivery.inProgressDeliveries, color: '#4b8bf5' },
                  { label: 'Canceladas', value: data.delivery.cancelledDeliveries, color: '#d64545' },
                  { label: 'Fallidas', value: data.delivery.failedDeliveries, color: '#f5a524' },
                ]}
              />
            </div>
          </Section>
        </>
      )}
    </AdminShell>
  );
}
