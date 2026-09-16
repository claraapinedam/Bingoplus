'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { apiFetch } from '@/lib/api';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

const PRESETS = [
  { value: 'today', label: 'Hoy' },
  { value: 'last_7_days', label: 'Últimos 7 días' },
  { value: 'last_30_days', label: 'Últimos 30 días' },
  { value: 'this_month', label: 'Este mes' },
  { value: 'last_month', label: 'Mes anterior' },
];

interface AdminAnalytics {
  marketplace: {
    gmv: number;
    ordersCount: number;
    completedOrders: number;
    cancelledOrders: number;
    averageTicket: number;
    deliveryVsPickup: { delivery: number; pickup: number };
    estimatedCommissionRevenue: number;
    discountsGranted: number;
  };
  directory: {
    activeBusinesses: number;
    newBusinesses: number;
    activeMemberships: number;
    cancelledMemberships: number;
    businessesByCategory: { categoryId: string; name: string; count: number }[];
    businessesByCapability: Record<string, number>;
  };
  services: {
    bookingsCount: number;
    completedBookings: number;
    cancelledBookings: number;
    noShowBookings: number;
    topServices: { serviceId: string; name: string; business: string; bookingsCount: number }[];
  };
  delivery: {
    deliveriesCount: number;
    completedDeliveries: number;
    cancelledDeliveries: number;
    failedDeliveries: number;
    averageDurationMinutes: number | null;
    averageDistanceKm: number | null;
    activeRiders: number;
    incidents: number;
  };
  coupons: {
    businessCoupons: { active: number; redemptions: number; discountGranted: number };
    adminCoupons: { active: number; redemptions: number };
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>{children}</div>
    </section>
  );
}

export default function AdminAnalyticsPage() {
  const [preset, setPreset] = useState('last_30_days');
  const [data, setData] = useState<AdminAnalytics | null>(null);

  const load = useCallback(() => {
    apiFetch<AdminAnalytics>(`/admin/analytics?preset=${preset}`).then(setData).catch(() => setData(null));
  }, [preset]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AdminShell>
      <h1 className="bingo-page-title">Analíticas</h1>
      <p className="bingo-page-subtitle">Métricas reales de toda la plataforma — nunca estimaciones inventadas.</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {PRESETS.map((p) => (
          <button key={p.value} onClick={() => setPreset(p.value)} className={`bingo-button ${preset === p.value ? '' : 'secondary'}`} style={{ padding: '8px 14px', fontSize: 13 }}>
            {p.label}
          </button>
        ))}
      </div>

      {data === null ? (
        <p>Cargando…</p>
      ) : (
        <>
          <Section title="Marketplace">
            <Kpi label="GMV" value={currencyFormatter.format(data.marketplace.gmv)} />
            <Kpi label="Pedidos" value={data.marketplace.ordersCount} />
            <Kpi label="Completados" value={data.marketplace.completedOrders} />
            <Kpi label="Cancelados" value={data.marketplace.cancelledOrders} />
            <Kpi label="Ticket promedio" value={currencyFormatter.format(data.marketplace.averageTicket)} />
            <Kpi label="Delivery" value={data.marketplace.deliveryVsPickup.delivery} />
            <Kpi label="Pickup" value={data.marketplace.deliveryVsPickup.pickup} />
            <Kpi label="Comisión estimada" value={currencyFormatter.format(data.marketplace.estimatedCommissionRevenue)} />
            <Kpi label="Descuentos otorgados" value={currencyFormatter.format(data.marketplace.discountsGranted)} />
          </Section>

          <Section title="Directorio">
            <Kpi label="Negocios activos" value={data.directory.activeBusinesses} />
            <Kpi label="Nuevos en el período" value={data.directory.newBusinesses} />
            <Kpi label="Membresías activas" value={data.directory.activeMemberships} />
            <Kpi label="Membresías canceladas" value={data.directory.cancelledMemberships} />
          </Section>

          <Section title="Servicios y Reservas">
            <Kpi label="Reservas" value={data.services.bookingsCount} />
            <Kpi label="Completadas" value={data.services.completedBookings} />
            <Kpi label="Canceladas" value={data.services.cancelledBookings} />
            <Kpi label="No asistió" value={data.services.noShowBookings} />
          </Section>

          <Section title="Delivery">
            <Kpi label="Entregas" value={data.delivery.deliveriesCount} />
            <Kpi label="Completadas" value={data.delivery.completedDeliveries} />
            <Kpi label="Canceladas" value={data.delivery.cancelledDeliveries} />
            <Kpi label="Fallidas" value={data.delivery.failedDeliveries} />
            <Kpi label="Duración promedio" value={data.delivery.averageDurationMinutes != null ? `${data.delivery.averageDurationMinutes} min` : '—'} />
            <Kpi label="Distancia promedio" value={data.delivery.averageDistanceKm != null ? `${data.delivery.averageDistanceKm} km` : '—'} />
            <Kpi label="Riders activos" value={data.delivery.activeRiders} />
            <Kpi label="Incidencias" value={data.delivery.incidents} />
          </Section>

          <Section title="Cupones de Negocios">
            <Kpi label="Activos" value={data.coupons.businessCoupons.active} />
            <Kpi label="Redenciones" value={data.coupons.businessCoupons.redemptions} />
            <Kpi label="Descuento otorgado" value={currencyFormatter.format(data.coupons.businessCoupons.discountGranted)} />
          </Section>

          <Section title="Cupones de Plataforma (Membresías)">
            <Kpi label="Activos" value={data.coupons.adminCoupons.active} />
            <Kpi label="Redenciones" value={data.coupons.adminCoupons.redemptions} />
          </Section>

          {data.services.topServices.length > 0 && (
            <div className="bingo-card" style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>Servicios más reservados</h2>
              <table className="bingo-table">
                <thead>
                  <tr>
                    <th>Servicio</th>
                    <th>Negocio</th>
                    <th>Reservas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.services.topServices.map((s) => (
                    <tr key={s.serviceId}>
                      <td>{s.name}</td>
                      <td>{s.business}</td>
                      <td>{s.bookingsCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="bingo-card">
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>Negocios por categoría (activos)</h2>
            <table className="bingo-table">
              <thead>
                <tr>
                  <th>Categoría</th>
                  <th>Negocios</th>
                </tr>
              </thead>
              <tbody>
                {data.directory.businessesByCategory.map((c) => (
                  <tr key={c.categoryId}>
                    <td>{c.name}</td>
                    <td>{c.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AdminShell>
  );
}
