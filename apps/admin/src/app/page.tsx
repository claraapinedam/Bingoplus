'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { apiFetch, apiFetchPage } from '@/lib/api';

interface Kpis {
  customers: number;
  businessesPending: number;
  businessesActive: number;
  ridersPending: number;
  ridersActive: number;
  orders: number;
  ordersNew: number;
  activeDeliveries: number;
  payments: number;
  activeBusinessCoupons: number;
  activeMembershipPlans: number;
}

function KpiCard({ label, value, href, warn }: { label: string; value: number | null; href?: string; warn?: boolean }) {
  const content = (
    <>
      <div style={{ fontSize: 26, fontWeight: 800, color: warn && value ? 'var(--bingo-warning)' : 'var(--bingo-navy)' }}>
        {value === null ? '—' : value}
      </div>
      <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 4 }}>{label}</div>
    </>
  );
  if (!href) {
    return <div className="bingo-card">{content}</div>;
  }
  return (
    <a href={href} className="bingo-card" style={{ display: 'block', textDecoration: 'none' }}>
      {content}
    </a>
  );
}

// pageSize=1 everywhere below — only meta.total is needed, never the rows themselves, so this
// stays a cheap count query instead of pulling every row just to measure them client-side.
export default function HomePage() {
  const [kpis, setKpis] = useState<Kpis | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetchPage(`/admin/customers?pageSize=1`).then((r) => r.meta.total),
      Promise.all([
        apiFetchPage(`/admin/businesses?status=PENDING&pageSize=1`).then((r) => r.meta.total),
        apiFetchPage(`/admin/businesses?status=UNDER_REVIEW&pageSize=1`).then((r) => r.meta.total),
        apiFetchPage(`/admin/businesses?status=APPROVED&pageSize=1`).then((r) => r.meta.total),
      ]).then(([pending, underReview, approved]) => pending + underReview + approved),
      apiFetchPage(`/admin/businesses?status=ACTIVE&pageSize=1`).then((r) => r.meta.total),
      apiFetchPage(`/admin/riders?status=PENDING_APPROVAL&pageSize=1`).then((r) => r.meta.total),
      apiFetchPage(`/admin/riders?status=ACTIVE&pageSize=1`).then((r) => r.meta.total),
      apiFetchPage(`/admin/orders?pageSize=1`).then((r) => r.meta.total),
      apiFetchPage(`/admin/orders?status=PAID&pageSize=1`).then((r) => r.meta.total),
      apiFetch<{ status: string }[]>(`/admin/deliveries`).then(
        (rows) => rows.filter((d) => !['DELIVERED', 'CANCELLED', 'FAILED'].includes(d.status)).length,
      ),
      apiFetchPage(`/admin/payments?pageSize=1`).then((r) => r.meta.total),
      apiFetchPage(`/admin/business-coupons?status=ACTIVE&pageSize=1`).then((r) => r.meta.total),
      apiFetch<{ status: string }[]>(`/admin/membership-plans`).then((rows) => rows.filter((p) => p.status === 'ACTIVE').length),
    ])
      .then(
        ([
          customers,
          businessesPending,
          businessesActive,
          ridersPending,
          ridersActive,
          orders,
          ordersNew,
          activeDeliveries,
          payments,
          activeBusinessCoupons,
          activeMembershipPlans,
        ]) =>
          setKpis({
            customers,
            businessesPending,
            businessesActive,
            ridersPending,
            ridersActive,
            orders,
            ordersNew,
            activeDeliveries,
            payments,
            activeBusinessCoupons,
            activeMembershipPlans,
          }),
      )
      .catch(() => undefined);
  }, []);

  return (
    <AdminShell>
      <h1 className="bingo-page-title">Inicio</h1>
      <p className="bingo-page-subtitle">Resumen del ecosistema BINGO+ — cifras reales, sin analítica avanzada (eso es FASE 8).</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginBottom: 28 }}>
        <KpiCard label="Clientes" value={kpis?.customers ?? null} href="/customers" />
        <KpiCard label="Solicitudes de negocios" value={kpis?.businessesPending ?? null} href="/businesses/requests" warn />
        <KpiCard label="Negocios activos" value={kpis?.businessesActive ?? null} href="/businesses" />
        <KpiCard label="Riders pendientes" value={kpis?.ridersPending ?? null} href="/riders/requests" warn />
        <KpiCard label="Riders activos" value={kpis?.ridersActive ?? null} href="/riders" />
        <KpiCard label="Pedidos (total)" value={kpis?.orders ?? null} />
        <KpiCard label="Pedidos nuevos (PAID)" value={kpis?.ordersNew ?? null} warn />
        <KpiCard label="Entregas activas" value={kpis?.activeDeliveries ?? null} href="/deliveries" />
        <KpiCard label="Pagos" value={kpis?.payments ?? null} />
        <KpiCard label="Cupones de negocio activos" value={kpis?.activeBusinessCoupons ?? null} />
        <KpiCard label="Planes de membresía activos" value={kpis?.activeMembershipPlans ?? null} href="/membership-plans" />
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <a href="/businesses/requests" className="bingo-button secondary" style={{ padding: '10px 18px' }}>
          Revisar negocios pendientes
        </a>
        <a href="/riders/requests" className="bingo-button secondary" style={{ padding: '10px 18px' }}>
          Revisar riders pendientes
        </a>
        <a href="/audit-logs" className="bingo-button secondary" style={{ padding: '10px 18px' }}>
          Ver auditoría
        </a>
      </div>
    </AdminShell>
  );
}
