'use client';

import { useEffect, useState } from 'react';
import DashboardShell, { useBusiness } from '@/components/DashboardShell';
import { apiFetchPage, getActiveBusinessId } from '@/lib/api';

function KpiCard({ label, value, href, warn }: { label: string; value: number | null; href: string; warn?: boolean }) {
  return (
    <a href={href} className="dashboard-kpi-card" style={{ display: 'block' }}>
      <div className="dashboard-kpi-value" style={warn && value ? { color: 'var(--bingo-warning)' } : undefined}>
        {value === null ? '—' : value}
      </div>
      <div className="dashboard-kpi-label">{label}</div>
    </a>
  );
}

function HomeContent() {
  const { business } = useBusiness();
  const businessId = getActiveBusinessId();
  const [orderCounts, setOrderCounts] = useState<Record<string, number> | null>(null);
  const [lowStockCount, setLowStockCount] = useState<number | null>(null);

  // pageSize=1 — the row data itself isn't needed here, only meta.total, so this stays a cheap
  // count query rather than pulling every order just to measure them client-side.
  useEffect(() => {
    if (!businessId) return;
    Promise.all(
      ['PAID', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP'].map((status) =>
        apiFetchPage(`/me/business/${businessId}/orders?status=${status}&pageSize=1`).then((r) => r.meta.total),
      ),
    )
      .then(([paid, confirmed, preparing, ready]) =>
        setOrderCounts({ PAID: paid, CONFIRMED: confirmed, PREPARING: preparing, READY_FOR_PICKUP: ready }),
      )
      .catch(() => setOrderCounts(null));
  }, [businessId]);

  useEffect(() => {
    if (!businessId || !business.capabilities.SELLS_PRODUCTS) return;
    apiFetchPage(`/business/${businessId}/products?lowStock=true&pageSize=1`)
      .then((r) => setLowStockCount(r.meta.total))
      .catch(() => undefined);
  }, [businessId, business.capabilities.SELLS_PRODUCTS]);

  return (
    <>
      <header className="dashboard-page-header">
        <div>
          <div className="dashboard-page-title">Hola, {business.tradeName}</div>
          <div className="dashboard-page-subtitle">Resumen de tu negocio en BINGO+</div>
        </div>
      </header>

      <div className="dashboard-kpi-grid">
        <KpiCard label="Pedidos nuevos" value={orderCounts?.PAID ?? null} href="/orders?status=PAID" />
        <KpiCard label="Confirmados" value={orderCounts?.CONFIRMED ?? null} href="/orders?status=CONFIRMED" />
        <KpiCard label="En preparación" value={orderCounts?.PREPARING ?? null} href="/orders?status=PREPARING" />
        <KpiCard label="Listos" value={orderCounts?.READY_FOR_PICKUP ?? null} href="/orders?status=READY_FOR_PICKUP" />
        {business.capabilities.SELLS_PRODUCTS && (
          <KpiCard label="Productos con stock bajo" value={lowStockCount} href="/inventory" warn />
        )}
      </div>

      <h2 className="bingo-section-title" style={{ marginTop: 0 }}>
        Accesos rápidos
      </h2>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <a href="/orders" className="bingo-card" style={{ fontWeight: 700, fontSize: 13 }}>
          Ver pedidos
        </a>
        {business.capabilities.SELLS_PRODUCTS && (
          <a href="/products/new" className="bingo-card" style={{ fontWeight: 700, fontSize: 13 }}>
            Agregar producto
          </a>
        )}
        {business.capabilities.COUPONS && (
          <a href="/coupons/new" className="bingo-card" style={{ fontWeight: 700, fontSize: 13 }}>
            Crear cupón
          </a>
        )}
        <a href="/profile" className="bingo-card" style={{ fontWeight: 700, fontSize: 13 }}>
          Editar perfil
        </a>
      </div>
    </>
  );
}

export default function HomePage() {
  return (
    <DashboardShell>
      <HomeContent />
    </DashboardShell>
  );
}
