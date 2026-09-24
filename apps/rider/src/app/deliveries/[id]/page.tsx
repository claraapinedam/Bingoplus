'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import RiderShell from '@/components/RiderShell';
import EmptyState from '@/components/EmptyState';
import MapView from '@/components/MapView';
import DeliveryChat from '@/components/DeliveryChat';
import { apiFetch, ApiError, watchUserLocation } from '@/lib/api';
import { connectSocket } from '@/lib/socket';
import { GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_LOADER_ID } from '@/lib/googleMaps';
import { useJsApiLoader } from '@react-google-maps/api';
import {
  API_ERROR_MESSAGES,
  DELIVERY_NEXT_ACTION,
  DELIVERY_STATUS_COLORS,
  DELIVERY_STATUS_LABELS,
  RIDER_ACTIVE_STATUSES,
} from '@/lib/deliveryStatus';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });
/** Matches the backend's documented default LOCATION_UPDATE_INTERVAL (.env.example) — not an
 * aggressive per-second ping. Also throttles the live Directions recompute below, for the same
 * "no polling agresivo" reason — no need to hit the Directions API any faster than the location
 * itself is even allowed to update. */
const LOCATION_UPDATE_INTERVAL_MS = 15000;
/** Statuses during which the backend actually accepts a location update (RiderLocationService) —
 * posting outside this window would just get a 403, so don't even try. */
const TRACKABLE_STATUSES = ['RIDER_ACCEPTED', 'GOING_TO_PICKUP', 'ARRIVED_AT_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_CUSTOMER'];
/** Before pickup, the live route/map should track rider → business; after, rider → customer. */
const PRE_PICKUP_STATUSES = ['RIDER_ACCEPTED', 'GOING_TO_PICKUP', 'ARRIVED_AT_PICKUP'];

function travelModeFor(vehicleType: string | undefined): google.maps.TravelMode {
  if (vehicleType === 'BIKE') return google.maps.TravelMode.BICYCLING;
  if (vehicleType === 'WALK') return google.maps.TravelMode.WALKING;
  return google.maps.TravelMode.DRIVING;
}

interface AddressSnapshot {
  tradeName?: string;
  label?: string;
  line1?: string;
  line2?: string | null;
  city?: string;
  addressLine?: string;
  latitude?: number | null;
  longitude?: number | null;
}

interface DeliveryDetail {
  id: string;
  status: string;
  pickupAddressSnapshot: AddressSnapshot;
  deliveryAddressSnapshot: AddressSnapshot;
  estimatedDistanceKm: number | null;
  estimatedDurationMinutes: number | null;
  // The rider's own commission for this delivery — never the gross fare/tariff the customer or
  // business paid. Shown at accept time too, not just after completion.
  riderNetAmount: number;
  order: { id: string; orderNumber: string };
  route: { polyline: string } | null;
  rider: { vehicles: { type: string }[] } | null;
  // Offer-screen fields (Dispatch V2) — the rider→pickup distance/ETA EtaRankingService computed
  // when this offer was made, plus how long the rider has to respond before OfferTimeoutSweeper
  // reassigns it. Different from estimatedDistanceKm/estimatedDurationMinutes above, which is the
  // whole pickup→customer route, not rider→pickup.
  pickupDistanceKm: number | null;
  pickupEtaMinutes: number | null;
  assignmentTimeoutSeconds: number | null;
  assignedAt: string | null;
}

function useOfferCountdown(assignedAt: string | null, assignmentTimeoutSeconds: number | null, active: boolean): number | null {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!active || !assignedAt || !assignmentTimeoutSeconds) {
      setSecondsLeft(null);
      return;
    }
    const deadline = new Date(assignedAt).getTime() + assignmentTimeoutSeconds * 1000;
    const tick = () => setSecondsLeft(Math.max(0, Math.round((deadline - Date.now()) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [active, assignedAt, assignmentTimeoutSeconds]);

  return secondsLeft;
}

export default function DeliveryDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [delivery, setDelivery] = useState<DeliveryDetail | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [liveRoute, setLiveRoute] = useState<{ path: { lat: number; lng: number }[]; distanceKm: number; durationMinutes: number } | null>(
    null,
  );
  const watchStopRef = useRef<(() => void) | null>(null);
  const lastSentRef = useRef(0);
  const lastRouteComputeRef = useRef(0);

  const { isLoaded: mapsLoaded } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const load = useCallback(() => {
    apiFetch<DeliveryDetail>(`/rider/deliveries/${params.id}`)
      .then(setDelivery)
      .catch(() => setDelivery(null));
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: reflect status changes made elsewhere (e.g. admin reassigns/cancels this delivery
  // while the rider has it open) without the rider needing to back out and re-enter.
  useEffect(() => {
    const socket = connectSocket();
    if (!socket || !params.id) return;
    socket.emit('subscribe:delivery', { deliveryId: params.id });
    const onStatus = () => load();
    socket.on('delivery.status.updated', onStatus);
    socket.on('delivery.completed', onStatus);
    return () => {
      socket.emit('unsubscribe:delivery', { deliveryId: params.id });
      socket.off('delivery.status.updated', onStatus);
      socket.off('delivery.completed', onStatus);
    };
  }, [params.id, load]);

  // Live location: only while this delivery is in an actively-tracked stage (§35/36) — starts and
  // stops automatically as status changes, throttled to LOCATION_UPDATE_INTERVAL_MS regardless of
  // how often the browser's watchPosition fires.
  useEffect(() => {
    watchStopRef.current?.();
    watchStopRef.current = null;
    if (!delivery || !TRACKABLE_STATUSES.includes(delivery.status)) return;

    watchStopRef.current = watchUserLocation((coords) => {
      setMyLocation({ lat: coords.latitude, lng: coords.longitude });
      const now = Date.now();
      if (now - lastSentRef.current < LOCATION_UPDATE_INTERVAL_MS) return;
      lastSentRef.current = now;
      apiFetch(`/rider/deliveries/${params.id}/location`, { method: 'POST', body: JSON.stringify(coords) }).catch(
        () => undefined,
      );
    });
    return () => {
      watchStopRef.current?.();
      watchStopRef.current = null;
    };
  }, [delivery, params.id]);

  // Live "on my way" route: before pickup, tracks rider → business; after, rider → customer. Only
  // ever the current leg, so it visibly shrinks as the rider gets closer instead of always showing
  // the full pickup→customer route the backend computed once at delivery creation.
  useEffect(() => {
    if (!mapsLoaded || !myLocation || !delivery || !TRACKABLE_STATUSES.includes(delivery.status)) {
      setLiveRoute(null);
      return;
    }
    const target = PRE_PICKUP_STATUSES.includes(delivery.status)
      ? delivery.pickupAddressSnapshot
      : delivery.deliveryAddressSnapshot;
    if (target.latitude == null || target.longitude == null) return;

    const now = Date.now();
    if (now - lastRouteComputeRef.current < LOCATION_UPDATE_INTERVAL_MS) return;
    lastRouteComputeRef.current = now;

    const vehicleType = delivery.rider?.vehicles?.[0]?.type;
    new google.maps.DirectionsService().route(
      {
        origin: myLocation,
        destination: { lat: target.latitude, lng: target.longitude },
        travelMode: travelModeFor(vehicleType),
      },
      (result, status) => {
        if (status !== 'OK' || !result?.routes[0]) {
          // Was previously swallowed with no trace at all — a rider stuck on a route that
          // silently never renders (bad API key restriction, quota, ZERO_RESULTS, etc.) had zero
          // way to know why. Logged, not surfaced as a UI error banner, since the straight-line
          // fallback below already keeps something correct-but-approximate on screen.
          console.error('[deliveries/[id]] Live route DirectionsService failed', status);
          return;
        }
        const leg = result.routes[0].legs[0];
        setLiveRoute({
          path: result.routes[0].overview_path.map((p) => ({ lat: p.lat(), lng: p.lng() })),
          distanceKm: (leg.distance?.value ?? 0) / 1000,
          durationMinutes: Math.round((leg.duration?.value ?? 0) / 60),
        });
      },
    );
  }, [mapsLoaded, myLocation, delivery]);

  // Straight-line fallback for the current leg (rider → business, or rider → customer) — always
  // available the instant we have a GPS fix and a target, with no Directions API round trip. This
  // is what actually renders on the map until/unless the real DirectionsService route above lands;
  // relying on the static whole-trip `delivery.route.polyline` here was the real bug users saw as
  // "no route" — that polyline runs business→customer and never touches the rider's own position,
  // so during GOING_TO_PICKUP it drew a line that had nothing to do with where the rider actually
  // was, which reads as "no route to the business" even though *a* line was technically on screen.
  const fallbackRoutePath = useMemo(() => {
    if (!myLocation || !delivery || !TRACKABLE_STATUSES.includes(delivery.status)) return null;
    const target = PRE_PICKUP_STATUSES.includes(delivery.status)
      ? delivery.pickupAddressSnapshot
      : delivery.deliveryAddressSnapshot;
    if (target.latitude == null || target.longitude == null) return null;
    return [myLocation, { lat: target.latitude, lng: target.longitude }];
  }, [myLocation, delivery]);

  const displayRoutePath = liveRoute?.path ?? fallbackRoutePath;

  const offerSecondsLeft = useOfferCountdown(
    delivery?.assignedAt ?? null,
    delivery?.assignmentTimeoutSeconds ?? null,
    delivery?.status === 'RIDER_ASSIGNED',
  );

  async function runAction(action: string, body?: object) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/rider/deliveries/${params.id}/${action}`, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? (API_ERROR_MESSAGES[err.code] ?? err.message) : 'No se pudo completar la acción.');
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    await runAction('reject');
    router.push('/');
  }

  if (delivery === undefined) {
    return (
      <RiderShell>
        <div className="bingo-content">
          <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
        </div>
      </RiderShell>
    );
  }
  if (!delivery) {
    return (
      <RiderShell>
        <div className="bingo-content">
          <EmptyState title="Entrega no disponible" subtitle="No encontramos esta entrega o no te pertenece." />
        </div>
      </RiderShell>
    );
  }

  const pickup = delivery.pickupAddressSnapshot;
  const dest = delivery.deliveryAddressSnapshot;
  const isTerminal = ['DELIVERED', 'CANCELLED', 'FAILED'].includes(delivery.status);
  const nextAction = DELIVERY_NEXT_ACTION[delivery.status];

  /** Opens the full trip — rider's current position → business (waypoint) → customer (final
   * destination) — in Google Maps as a single multi-stop route, so the rider always has an escape
   * hatch to real turn-by-turn navigation regardless of whether the in-app live route rendered. */
  function openInGoogleMaps() {
    if (!myLocation || pickup.latitude == null || pickup.longitude == null || dest.latitude == null || dest.longitude == null) return;
    const origin = `${myLocation.lat},${myLocation.lng}`;
    const waypoint = `${pickup.latitude},${pickup.longitude}`;
    const destinationParam = `${dest.latitude},${dest.longitude}`;
    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${encodeURIComponent(destinationParam)}&waypoints=${encodeURIComponent(waypoint)}&travelmode=driving`;
    window.open(url, '_blank');
  }

  const canOpenInGoogleMaps =
    !isTerminal && !!myLocation && pickup.latitude != null && pickup.longitude != null && dest.latitude != null && dest.longitude != null;

  return (
    <RiderShell>
      <header className="bingo-header">
        <button className="bingo-button secondary small" style={{ marginBottom: 10 }} onClick={() => router.push('/')}>
          ← Inicio
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo%20para%20fondo%20osc.png" alt="BINGO+" className="bingo-logo-img" />
        <div className="bingo-header-sub" style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          Pedido {delivery.order.orderNumber}
          <span
            className="bingo-badge"
            style={{ background: 'rgba(255,255,255,0.15)', color: DELIVERY_STATUS_COLORS[delivery.status] ?? 'white' }}
          >
            {DELIVERY_STATUS_LABELS[delivery.status] ?? delivery.status}
          </span>
        </div>
      </header>

      <div className="bingo-content">
        {delivery.status === 'DELIVERED' && (
          <div className="bingo-card" style={{ textAlign: 'center', background: 'var(--bingo-success)', color: 'white' }}>
            <div style={{ fontSize: 34 }}>✅</div>
            <div style={{ fontWeight: 800, fontSize: 16, marginTop: 4 }}>Entrega completada</div>
          </div>
        )}
        {(delivery.status === 'CANCELLED' || delivery.status === 'FAILED') && (
          <div className="bingo-error-banner">Esta entrega ya no está activa.</div>
        )}

        <h2 className="bingo-section-title" style={{ marginTop: isTerminal ? 16 : 0 }}>
          Recogida
        </h2>
        <div className="bingo-card">
          <div style={{ fontWeight: 800, fontSize: 15 }}>{pickup.tradeName ?? 'Negocio'}</div>
          <div style={{ fontSize: 13, color: '#7f8ea3', marginTop: 4 }}>
            {pickup.addressLine}, {pickup.city}
          </div>
        </div>

        <h2 className="bingo-section-title">Entrega</h2>
        <div className="bingo-card">
          <div style={{ fontWeight: 800, fontSize: 15 }}>{dest.label ?? 'Dirección del cliente'}</div>
          <div style={{ fontSize: 13, color: '#7f8ea3', marginTop: 4 }}>
            {dest.line1}
            {dest.line2 ? `, ${dest.line2}` : ''}, {dest.city}
          </div>
        </div>

        {!isTerminal && (
          <div style={{ marginTop: 16 }}>
            <MapView
              pickup={pickup.latitude != null && pickup.longitude != null ? { lat: pickup.latitude, lng: pickup.longitude, label: pickup.tradeName } : null}
              destination={dest.latitude != null && dest.longitude != null ? { lat: dest.latitude, lng: dest.longitude, label: 'Cliente' } : null}
              rider={myLocation ? { ...myLocation, vehicleType: delivery.rider?.vehicles?.[0]?.type ?? null } : null}
              routePolyline={delivery.route?.polyline ?? null}
              routePath={displayRoutePath}
              height={200}
            />
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8 }}>
              {liveRoute
                ? `${liveRoute.distanceKm.toFixed(1)} km · ~${liveRoute.durationMinutes} min`
                : delivery.estimatedDistanceKm != null
                  ? `${delivery.estimatedDistanceKm.toFixed(1)} km${delivery.estimatedDurationMinutes != null ? ` · ~${delivery.estimatedDurationMinutes} min` : ''}`
                  : 'Distancia no disponible'}
            </div>
            <div style={{ fontSize: 11, color: '#7f8ea3', marginTop: 4 }}>
              {delivery.status === 'RIDER_ASSIGNED' || PRE_PICKUP_STATUSES.includes(delivery.status)
                ? 'Voy en camino al negocio'
                : 'Voy en camino al cliente'}
              {liveRoute ? ' · en vivo' : fallbackRoutePath ? ' · línea directa' : ''}
            </div>
            {canOpenInGoogleMaps && (
              <button className="bingo-button secondary" style={{ marginTop: 10 }} onClick={openInGoogleMaps}>
                Abrir recorrido en Google Maps
              </button>
            )}
          </div>
        )}

        <div className="bingo-card" style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: '#7f8ea3' }}>
            {delivery.status === 'RIDER_ASSIGNED' ? 'Ganarás por esta entrega' : 'Ganancia de esta entrega'}
          </span>
          <span style={{ fontWeight: 800 }}>{currencyFormatter.format(Number(delivery.riderNetAmount))}</span>
        </div>

        {delivery.status === 'RIDER_ASSIGNED' && (delivery.pickupDistanceKm != null || delivery.pickupEtaMinutes != null || offerSecondsLeft != null) && (
          <div className="bingo-card" style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 13 }}>
              {delivery.pickupDistanceKm != null && <span>{delivery.pickupDistanceKm.toFixed(1)} km hasta el negocio</span>}
              {delivery.pickupEtaMinutes != null && <span> · ~{delivery.pickupEtaMinutes} min</span>}
            </div>
            {offerSecondsLeft != null && (
              <span
                className="bingo-badge"
                style={{
                  background: offerSecondsLeft <= 10 ? 'var(--bingo-error)' : '#f2f4f7',
                  color: offerSecondsLeft <= 10 ? 'white' : 'var(--bingo-coral)',
                  fontWeight: 800,
                }}
              >
                {offerSecondsLeft}s
              </span>
            )}
          </div>
        )}

        {error && <div className="bingo-error-banner" style={{ marginTop: 12 }}>{error}</div>}

        {delivery.status === 'RIDER_ASSIGNED' && (
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button className="bingo-button danger" disabled={busy} onClick={reject}>
              Rechazar
            </button>
            <button className="bingo-button" disabled={busy} onClick={() => runAction('accept')}>
              Aceptar
            </button>
          </div>
        )}

        {nextAction && (
          <button
            className="bingo-button"
            style={{ marginTop: 16, background: 'var(--bingo-navy)' }}
            disabled={busy}
            onClick={() => runAction(nextAction.action)}
          >
            {busy ? 'Procesando…' : nextAction.label}
          </button>
        )}

        {/* Visible from the moment this delivery is assigned (this page only ever shows a delivery
            already assigned to the logged-in rider) through completion — goes read-only once
            terminal instead of disappearing, so the rider can still see what was said. */}
        <DeliveryChat deliveryId={delivery.id} active={!isTerminal} />

        {delivery.status === 'ARRIVED_AT_CUSTOMER' && (
          <div className="bingo-card" style={{ marginTop: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6 }}>
              Código de entrega del cliente
            </label>
            <input
              className="bingo-input"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
            />
            <button
              className="bingo-button"
              style={{ marginTop: 10 }}
              disabled={busy || otpCode.length !== 6}
              onClick={() => runAction('complete', { otpCode })}
            >
              {busy ? 'Confirmando…' : 'CONFIRMAR ENTREGA'}
            </button>
          </div>
        )}
      </div>
    </RiderShell>
  );
}
