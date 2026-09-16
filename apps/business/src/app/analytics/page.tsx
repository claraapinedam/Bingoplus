'use client';

import { useCallback, useEffect, useState } from 'react';
import DashboardShell, { useBusiness } from '@/components/DashboardShell';
import { apiFetch, getActiveBusinessId } from '@/lib/api';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

const PRESETS = [
  { value: 'today', label: 'Hoy' },
  { value: 'last_7_days', label: 'Últimos 7 días' },
  { value: 'last_30_days', label: 'Últimos 30 días' },
  { value: 'this_month', label: 'Este mes' },
  { value: 'last_month', label: 'Mes anterior' },
];

interface AnalyticsData {
  range: { from: string; to: string; preset: string };
  marketplace: {
    ordersCount: number;
    completedOrders: number;
    cancelledOrders: number;
    revenue: number;
    averageTicket: number;
    deliveryVsPickup: { delivery: number; pickup: number };
    topProducts: { productId: string; name: string; quantitySold: number; revenue: number }[];
  } | null;
  directory: {
    profileViews: number;
    favorites: number;
    coupons: { views: number; redemptions: number } | null;
  } | null;
  services: {
    bookingsCount: number;
    confirmedBookings: number;
    completedBookings: number;
    cancelledBookings: number;
    noShowBookings: number;
    revenue: number;
    topServices: { serviceId: string; name: string; bookingsCount: number }[];
  } | null;
}

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bingo-card">
      <div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 4 }}>{label}</div>
    </div>
  );
}

function AnalyticsContent() {
  const { business } = useBusiness();
  const businessId = getActiveBusinessId();
  const [preset, setPreset] = useState('last_30_days');
  const [data, setData] = useState<AnalyticsData | null>(null);

  const load = useCallback(() => {
    if (!businessId) return;
    apiFetch<AnalyticsData>(`/business/${businessId}/analytics?preset=${preset}`)
      .then(setData)
      .catch(() => setData(null));
  }, [businessId, preset]);

  useEffect(() => {
    load();
  }, [load]);

  const noSections = !business.capabilities.SELLS_PRODUCTS && !business.capabilities.DIRECTORY_LISTING && !business.capabilities.SERVICES && !business.capabilities.BOOKINGS;

  return (
    <>
      <header className="dashboard-page-header">
        <div className="dashboard-page-title">Analíticas</div>
      </header>

      <div className="bingo-chip-row" style={{ marginBottom: 20 }}>
        {PRESETS.map((p) => (
          <button key={p.value} className={`bingo-chip${preset === p.value ? ' active' : ''}`} onClick={() => setPreset(p.value)}>
            {p.label}
          </button>
        ))}
      </div>

      {noSections && <p style={{ color: '#7f8ea3', fontSize: 13 }}>Tu negocio no tiene capacidades habilitadas con métricas disponibles todavía.</p>}

      {data === null ? (
        <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {data.marketplace && (
            <section>
              <h2 style={{ marginBottom: 12, fontSize: 16, fontWeight: 800, color: "var(--bingo-navy)" }}>Marketplace</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 12 }}>
                <KpiCard label="Ingresos" value={currencyFormatter.format(data.marketplace.revenue)} />
                <KpiCard label="Pedidos" value={data.marketplace.ordersCount} />
                <KpiCard label="Completados" value={data.marketplace.completedOrders} />
                <KpiCard label="Cancelados" value={data.marketplace.cancelledOrders} />
                <KpiCard label="Ticket promedio" value={currencyFormatter.format(data.marketplace.averageTicket)} />
                <KpiCard label="Delivery" value={data.marketplace.deliveryVsPickup.delivery} />
                <KpiCard label="Pickup" value={data.marketplace.deliveryVsPickup.pickup} />
              </div>
              {data.marketplace.topProducts.length > 0 && (
                <div className="bingo-card">
                  <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>Productos más vendidos</div>
                  {data.marketplace.topProducts.map((p) => (
                    <div key={p.productId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                      <span>{p.name}</span>
                      <span>{p.quantitySold} unid. · {currencyFormatter.format(p.revenue)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {data.directory && (
            <section>
              <h2 style={{ marginBottom: 12, fontSize: 16, fontWeight: 800, color: "var(--bingo-navy)" }}>Directorio</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                <KpiCard label="Visualizaciones de perfil" value={data.directory.profileViews} />
                <KpiCard label="Favoritos" value={data.directory.favorites} />
                {data.directory.coupons && (
                  <>
                    <KpiCard label="Vistas de cupón" value={data.directory.coupons.views} />
                    <KpiCard label="Redenciones" value={data.directory.coupons.redemptions} />
                  </>
                )}
              </div>
            </section>
          )}

          {data.services && (
            <section>
              <h2 style={{ marginBottom: 12, fontSize: 16, fontWeight: 800, color: "var(--bingo-navy)" }}>Servicios y Reservas</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 12 }}>
                <KpiCard label="Reservas" value={data.services.bookingsCount} />
                <KpiCard label="Confirmadas" value={data.services.confirmedBookings} />
                <KpiCard label="Completadas" value={data.services.completedBookings} />
                <KpiCard label="Canceladas" value={data.services.cancelledBookings} />
                <KpiCard label="No asistió" value={data.services.noShowBookings} />
                <KpiCard label="Ingresos" value={currencyFormatter.format(data.services.revenue)} />
              </div>
              {data.services.topServices.length > 0 && (
                <div className="bingo-card">
                  <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>Servicios más reservados</div>
                  {data.services.topServices.map((s) => (
                    <div key={s.serviceId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                      <span>{s.name}</span>
                      <span>{s.bookingsCount} reserva(s)</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </>
  );
}

export default function AnalyticsPage() {
  return (
    <DashboardShell>
      <AnalyticsContent />
    </DashboardShell>
  );
}
