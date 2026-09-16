'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardShell, { useBusiness } from '@/components/DashboardShell';
import EmptyState from '@/components/EmptyState';
import { apiFetch, getActiveBusinessId } from '@/lib/api';
import { DELIVERY_STATUS_LABELS } from '@/lib/orderStatus';

interface DeliveryRow {
  id: string;
  status: string;
  estimatedDurationMinutes: number | null;
  createdAt: string;
  order: { id: string; orderNumber: string };
  rider: { user: { firstName: string; lastName: string } } | null;
}

const ACTIVE_STATUSES = ['PENDING', 'SEARCHING_RIDER', 'RIDER_ASSIGNED', 'RIDER_ACCEPTED', 'GOING_TO_PICKUP', 'ARRIVED_AT_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_CUSTOMER'];

function DeliveryListContent() {
  const router = useRouter();
  const { business } = useBusiness();
  const businessId = getActiveBusinessId();
  const [deliveries, setDeliveries] = useState<DeliveryRow[] | null>(null);
  const [onlyActive, setOnlyActive] = useState(true);

  useEffect(() => {
    if (!businessId) return;
    apiFetch<DeliveryRow[]>(`/me/business/${businessId}/deliveries`)
      .then(setDeliveries)
      .catch(() => setDeliveries([]));
  }, [businessId]);

  if (!business.capabilities.SELLS_PRODUCTS || !business.capabilities.DELIVERY) {
    return <EmptyState title="Esta sección no está disponible" subtitle="Tu negocio no tiene habilitado el delivery." />;
  }

  const visible = deliveries?.filter((d) => !onlyActive || ACTIVE_STATUSES.includes(d.status)) ?? null;

  return (
    <>
      <header className="dashboard-page-header">
        <div>
          <div className="dashboard-page-title">Delivery</div>
          <div className="dashboard-page-subtitle">Entregas de tus pedidos — el detalle completo (mapa, ETA) está en cada pedido.</div>
        </div>
      </header>

      <div className="dashboard-toolbar">
        <button className={`bingo-chip${onlyActive ? ' active' : ''}`} onClick={() => setOnlyActive(true)}>
          En curso
        </button>
        <button className={`bingo-chip${!onlyActive ? ' active' : ''}`} onClick={() => setOnlyActive(false)}>
          Todas
        </button>
      </div>

      {visible === null ? (
        <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
      ) : visible.length === 0 ? (
        <EmptyState title="No hay entregas" />
      ) : (
        <div className="dashboard-table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Repartidor</th>
                <th>ETA</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((d) => (
                <tr key={d.id} onClick={() => router.push(`/orders/${d.order.id}`)}>
                  <td style={{ fontWeight: 700 }}>{d.order.orderNumber}</td>
                  <td>{d.rider ? `${d.rider.user.firstName} ${d.rider.user.lastName}` : 'Sin asignar'}</td>
                  <td>{d.estimatedDurationMinutes != null ? `~${d.estimatedDurationMinutes} min` : '—'}</td>
                  <td>
                    <span className="bingo-badge" style={{ background: '#f2f4f7', color: 'var(--bingo-navy)' }}>
                      {DELIVERY_STATUS_LABELS[d.status] ?? d.status}
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

export default function DeliveryListPage() {
  return (
    <DashboardShell>
      <DeliveryListContent />
    </DashboardShell>
  );
}
