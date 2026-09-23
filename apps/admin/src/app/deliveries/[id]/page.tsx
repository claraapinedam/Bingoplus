'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminShell from '@/components/AdminShell';
import BackButton from '@/components/BackButton';
import { apiFetch, ApiError } from '@/lib/api';

interface DeliveryDetail {
  id: string;
  status: string;
  pickupAddressSnapshot: { tradeName?: string; addressLine?: string; city?: string } | null;
  deliveryAddressSnapshot: { label?: string; line1?: string; city?: string } | null;
  estimatedDistanceKm: number | null;
  estimatedDurationMinutes: number | null;
  assignedAt: string | null;
  acceptedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  rider: { id: string; user: { firstName: string; lastName: string } } | null;
  order: { id: string; orderNumber: string; business: { tradeName: string }; user: { firstName: string; lastName: string } };
}

interface RiderOption {
  id: string;
  user: { firstName: string; lastName: string };
  availabilityStatus: string;
}

const TERMINAL = ['DELIVERED', 'CANCELLED', 'FAILED'];

export default function AdminDeliveryDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [delivery, setDelivery] = useState<DeliveryDetail | null | undefined>(undefined);
  const [riders, setRiders] = useState<RiderOption[]>([]);
  const [selectedRiderId, setSelectedRiderId] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDelivery(await apiFetch<DeliveryDetail>(`/admin/deliveries/${params.id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar la entrega.');
      setDelivery(null);
    }
  }, [params.id]);

  useEffect(() => {
    load();
    apiFetch<RiderOption[]>(`/admin/riders?status=ACTIVE`).then(setRiders).catch(() => undefined);
  }, [load]);

  async function assign(action: 'assign' | 'reassign') {
    if (!selectedRiderId) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/admin/deliveries/${params.id}/${action}`, { method: 'POST', body: JSON.stringify({ riderId: selectedRiderId }) });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo asignar el rider.');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/admin/deliveries/${params.id}/cancel`, { method: 'POST', body: JSON.stringify({ reason: cancelReason || 'Cancelado por administrador' }) });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cancelar la entrega.');
    } finally {
      setBusy(false);
    }
  }

  if (delivery === undefined) {
    return (
      <AdminShell>
        <p>Cargando…</p>
      </AdminShell>
    );
  }
  if (!delivery) {
    return (
      <AdminShell>
        <div className="bingo-card" style={{ color: 'var(--bingo-error)' }}>{error ?? 'Entrega no encontrada.'}</div>
      </AdminShell>
    );
  }

  const isTerminal = TERMINAL.includes(delivery.status);

  return (
    <AdminShell>
      <BackButton onClick={() => router.push('/deliveries')} label="Volver a Delivery" />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
        <h1 className="bingo-page-title" style={{ margin: 0 }}>Entrega — {delivery.order.orderNumber}</h1>
        <span>{delivery.order.user.firstName} {delivery.order.user.lastName} · {delivery.order.business.tradeName}</span>
        <span className={`bingo-badge badge-${delivery.status.toLowerCase()}`}>{delivery.status}</span>
        {/* Previously the only way to reach /orders/[id] (payment, refund status, items) from here
            was to know the URL — nothing on this page or /deliveries linked to it. */}
        <a href={`/orders/${delivery.order.id}`} className="bingo-button secondary small" style={{ width: 'auto', padding: '4px 12px' }}>
          Ver pedido
        </a>
      </div>

      {error && (
        <div className="bingo-card" style={{ marginBottom: 16, color: 'var(--bingo-error)' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="bingo-card">
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>Recorrido</h2>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            📍 {delivery.pickupAddressSnapshot?.tradeName ?? 'Negocio'} — {delivery.pickupAddressSnapshot?.addressLine}, {delivery.pickupAddressSnapshot?.city}
          </div>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            🏠 {delivery.deliveryAddressSnapshot?.line1}, {delivery.deliveryAddressSnapshot?.city}
          </div>
          {delivery.estimatedDistanceKm != null && (
            <div style={{ fontSize: 12, color: '#7f8ea3' }}>
              {delivery.estimatedDistanceKm.toFixed(1)} km · ~{delivery.estimatedDurationMinutes} min
            </div>
          )}
        </div>

        <div className="bingo-card">
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>Rider</h2>
          {delivery.rider ? (
            <p style={{ fontSize: 13, marginBottom: 12 }}>
              {delivery.rider.user.firstName} {delivery.rider.user.lastName}
            </p>
          ) : (
            <p style={{ fontSize: 13, color: '#7f8ea3', marginBottom: 12 }}>Sin rider asignado.</p>
          )}

          {!isTerminal && (
            <>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>
                {delivery.rider ? 'Reasignar a' : 'Asignar rider'}
              </label>
              <select className="bingo-input" value={selectedRiderId} onChange={(e) => setSelectedRiderId(e.target.value)} style={{ marginBottom: 8 }}>
                <option value="">Elige un rider activo…</option>
                {riders.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.user.firstName} {r.user.lastName} ({r.availabilityStatus})
                  </option>
                ))}
              </select>
              <button
                className="bingo-button"
                disabled={busy || !selectedRiderId}
                onClick={() => assign(delivery.rider ? 'reassign' : 'assign')}
              >
                {delivery.rider ? 'Reasignar' : 'Asignar'}
              </button>
            </>
          )}
        </div>

        <div className="bingo-card" style={{ gridColumn: 'span 2', fontSize: 12, color: '#9aa5b1' }}>
          Creado: {new Date(delivery.createdAt).toLocaleString('es-EC')}
          {delivery.assignedAt && <> · Asignado: {new Date(delivery.assignedAt).toLocaleString('es-EC')}</>}
          {delivery.pickedUpAt && <> · Recogido: {new Date(delivery.pickedUpAt).toLocaleString('es-EC')}</>}
          {delivery.deliveredAt && <> · Entregado: {new Date(delivery.deliveredAt).toLocaleString('es-EC')}</>}
        </div>

        {!isTerminal && (
          <div className="bingo-card" style={{ gridColumn: 'span 2' }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px', color: 'var(--bingo-error)' }}>Cancelar entrega</h2>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                className="bingo-input"
                placeholder="Motivo de la cancelación"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
              <button className="bingo-button danger" disabled={busy} onClick={cancel} style={{ whiteSpace: 'nowrap' }}>
                Cancelar entrega
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
