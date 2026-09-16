'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import CustomerShell from '@/components/CustomerShell';
import EmptyState from '@/components/EmptyState';
import MapView from '@/components/MapView';
import { apiFetch } from '@/lib/api';
import { connectSocket } from '@/lib/socket';
import { DELIVERY_STATUS_LABELS } from '@/lib/orderStatus';

/** Falls back to polling at this cadence (matches the backend's documented
 * LOCATION_UPDATE_INTERVAL default) whenever the WebSocket isn't connected — never more
 * aggressive than that, per the "no polling agresivo" rule. */
const POLL_INTERVAL_MS = 15000;

// FASE 4C: the timeline now spans both state machines — Order-level steps (confirmed/preparing/
// ready) happen before a Delivery even exists, then Delivery-level steps take over. Both are read
// straight from the backend's own enums, never a parallel frontend state machine.
const STEP_LABELS = [
  'Pedido confirmado',
  'Preparando',
  'Listo para retirar',
  'Buscando repartidor',
  'Repartidor asignado',
  'Repartidor yendo al negocio',
  'Repartidor en el negocio',
  'Pedido recogido',
  'En camino',
  'Repartidor llegando',
  'Entregado',
];

const ORDER_STATUS_TO_STEP: Record<string, number> = {
  CREATED: 0,
  PAYMENT_PENDING: 0,
  PAID: 0,
  CONFIRMED: 0,
  PREPARING: 1,
  READY_FOR_PICKUP: 2,
  COMPLETED: 10,
};

const DELIVERY_STATUS_TO_STEP: Record<string, number> = {
  PENDING: 2,
  SEARCHING_RIDER: 3,
  RIDER_ASSIGNED: 4,
  RIDER_ACCEPTED: 5,
  GOING_TO_PICKUP: 5,
  ARRIVED_AT_PICKUP: 6,
  PICKED_UP: 7,
  IN_TRANSIT: 8,
  ARRIVED_AT_CUSTOMER: 9,
  DELIVERED: 10,
};

function resolveStep(orderStatus: string, deliveryStatus: string | null): number {
  if (deliveryStatus && deliveryStatus in DELIVERY_STATUS_TO_STEP) return DELIVERY_STATUS_TO_STEP[deliveryStatus];
  return ORDER_STATUS_TO_STEP[orderStatus] ?? 0;
}

interface TrackingData {
  orderStatus: string;
  fulfillmentType: 'PICKUP' | 'DELIVERY';
  deliveryId: string | null;
  status: string | null;
  rider: { firstName: string; ratingAvg: number; vehicleType: string | null } | null;
  pickup: { tradeName?: string; addressLine?: string; city?: string; latitude?: number | null; longitude?: number | null } | null;
  destination: {
    label?: string;
    line1?: string;
    line2?: string | null;
    city?: string;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  route: { polyline: string } | null;
  estimatedDistanceKm: number | null;
  estimatedDurationMinutes: number | null;
}

interface LocationData {
  latitude: number | null;
  longitude: number | null;
  updatedAt: string | null;
}

const VEHICLE_LABELS: Record<string, string> = {
  WALK: 'A pie',
  BIKE: 'Bicicleta',
  MOTORCYCLE: 'Moto',
  CAR: 'Auto',
  OTHER: 'Vehículo',
};

export default function DeliveryTrackingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [tracking, setTracking] = useState<TrackingData | null | undefined>(undefined);
  const [location, setLocation] = useState<LocationData | null>(null);
  const [otp, setOtp] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const deliveryIdRef = useRef<string | null>(null);

  const load = useCallback(() => {
    apiFetch<TrackingData>(`/orders/${params.id}/tracking`)
      .then((data) => {
        setTracking(data);
        deliveryIdRef.current = data.deliveryId;
        if (data.deliveryId) {
          apiFetch<LocationData>(`/deliveries/${data.deliveryId}/location`).then(setLocation).catch(() => undefined);
          apiFetch<{ code: string | null }>(`/deliveries/${data.deliveryId}/otp`)
            .then((r) => setOtp(r.code))
            .catch(() => undefined);
        }
      })
      .catch(() => setTracking(null));
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime first, polling as the fallback the spec explicitly asks for — never both firing
  // aggressively at once (the poll interval only matters while `connected` is false).
  useEffect(() => {
    const socket = connectSocket();
    if (!socket) return;
    const onConnectEvt = () => {
      setConnected(true);
      if (deliveryIdRef.current) socket.emit('subscribe:delivery', { deliveryId: deliveryIdRef.current });
    };
    const onDisconnect = () => setConnected(false);
    const onStatus = () => load();
    const onLocation = (payload: { latitude: number; longitude: number }) =>
      setLocation({ latitude: payload.latitude, longitude: payload.longitude, updatedAt: new Date().toISOString() });
    const onCompleted = () => load();

    socket.on('connect', onConnectEvt);
    socket.on('disconnect', onDisconnect);
    socket.on('delivery.status.updated', onStatus);
    socket.on('delivery.location.updated', onLocation);
    socket.on('delivery.completed', onCompleted);
    if (socket.connected) onConnectEvt();

    return () => {
      if (deliveryIdRef.current) socket.emit('unsubscribe:delivery', { deliveryId: deliveryIdRef.current });
      socket.off('connect', onConnectEvt);
      socket.off('disconnect', onDisconnect);
      socket.off('delivery.status.updated', onStatus);
      socket.off('delivery.location.updated', onLocation);
      socket.off('delivery.completed', onCompleted);
    };
  }, [load]);

  useEffect(() => {
    if (connected) return;
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [connected, load]);

  if (tracking === undefined) {
    return (
      <CustomerShell>
        <div className="bingo-content">
          <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
        </div>
      </CustomerShell>
    );
  }
  if (!tracking) {
    return (
      <CustomerShell>
        <div className="bingo-content">
          <EmptyState title="Sin seguimiento disponible" subtitle="No encontramos este pedido." />
        </div>
      </CustomerShell>
    );
  }

  const isTerminal = tracking.status === 'CANCELLED' || tracking.status === 'FAILED' || tracking.orderStatus === 'CANCELLED';
  const currentStep = resolveStep(tracking.orderStatus, tracking.status);

  return (
    <CustomerShell>
      <header className="bingo-header">
        <button className="bingo-button secondary small" style={{ marginBottom: 10 }} onClick={() => router.back()}>
          ← Volver
        </button>
        <div className="bingo-logo" style={{ fontSize: 18 }}>
          Seguimiento de tu pedido
        </div>
        {!connected && <div className="bingo-header-sub">Actualizando cada {POLL_INTERVAL_MS / 1000}s…</div>}
      </header>

      <div className="bingo-content">
        {isTerminal ? (
          <div className="bingo-error-banner">
            {tracking.orderStatus === 'CANCELLED'
              ? 'Este pedido fue cancelado.'
              : tracking.status === 'CANCELLED'
                ? 'Esta entrega fue cancelada.'
                : 'No se pudo completar esta entrega.'}
          </div>
        ) : (
          <>
            <span className="bingo-badge" style={{ background: '#f2f4f7', color: 'var(--bingo-teal)', fontSize: 13 }}>
              {tracking.status ? (DELIVERY_STATUS_LABELS[tracking.status] ?? tracking.status) : STEP_LABELS[currentStep]}
            </span>

            {tracking.rider && (
              <div className="bingo-card" style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{tracking.rider.firstName}</div>
                  <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 2 }}>
                    ⭐ {tracking.rider.ratingAvg.toFixed(1)}
                    {tracking.rider.vehicleType ? ` · ${VEHICLE_LABELS[tracking.rider.vehicleType] ?? tracking.rider.vehicleType}` : ''}
                  </div>
                </div>
                <span style={{ fontSize: 24 }}>🛵</span>
              </div>
            )}

            {tracking.pickup && tracking.destination && (
              <div className="bingo-card" style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  {tracking.estimatedDurationMinutes != null ? `ETA: ~${tracking.estimatedDurationMinutes} min` : 'ETA no disponible'}
                  {tracking.estimatedDistanceKm != null ? ` · ${tracking.estimatedDistanceKm.toFixed(1)} km` : ''}
                </div>
                <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 6 }}>
                  📍 {tracking.pickup.tradeName ?? 'Negocio'} — {tracking.pickup.addressLine}, {tracking.pickup.city}
                </div>
                <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 4 }}>
                  🏠 {tracking.destination.line1}
                  {tracking.destination.line2 ? `, ${tracking.destination.line2}` : ''}, {tracking.destination.city}
                </div>

                <div style={{ marginTop: 10 }}>
                  <MapView
                    pickup={
                      tracking.pickup.latitude != null && tracking.pickup.longitude != null
                        ? { lat: tracking.pickup.latitude, lng: tracking.pickup.longitude, label: tracking.pickup.tradeName }
                        : null
                    }
                    destination={
                      tracking.destination.latitude != null && tracking.destination.longitude != null
                        ? { lat: tracking.destination.latitude, lng: tracking.destination.longitude, label: 'Destino' }
                        : null
                    }
                    rider={
                      location?.latitude != null && location.longitude != null
                        ? { lat: location.latitude, lng: location.longitude, vehicleType: tracking.rider?.vehicleType ?? null }
                        : null
                    }
                    routePolyline={tracking.route?.polyline ?? null}
                  />
                </div>
              </div>
            )}

            {otp && (
              <div className="bingo-card" style={{ marginTop: 12, textAlign: 'center', background: 'var(--bingo-navy)', color: 'white' }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Código de entrega — dáselo al repartidor</div>
                <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 4, marginTop: 4 }}>{otp}</div>
              </div>
            )}

            <h2 className="bingo-section-title">Seguimiento</h2>
            <div className="bingo-card">
              {STEP_LABELS.map((label, i) => (
                <div key={label} className="rider-timeline-item" style={{ opacity: i <= currentStep ? 1 : 0.4 }}>
                  <div
                    className="rider-timeline-dot"
                    style={{ background: i <= currentStep ? 'var(--bingo-teal)' : '#e0e4ea' }}
                  />
                  <div style={{ fontSize: 13, fontWeight: i === currentStep ? 800 : 500 }}>{label}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </CustomerShell>
  );
}
