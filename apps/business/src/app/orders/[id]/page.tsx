'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useJsApiLoader } from '@react-google-maps/api';
import DashboardShell from '@/components/DashboardShell';
import EmptyState from '@/components/EmptyState';
import MapView from '@/components/MapView';
import { apiFetch, ApiError, getActiveBusinessId } from '@/lib/api';
import { connectSocket } from '@/lib/socket';
import { GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_LOADER_ID } from '@/lib/googleMaps';
import {
  API_ERROR_MESSAGES,
  DELIVERY_STATUS_LABELS,
  getOrderNextAction,
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
} from '@/lib/orderStatus';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });
/** Matches the rider app's own live-route pattern exactly (see apps/rider's delivery detail page)
 * — same throttle, same current-leg split, same straight-line-then-upgrade-to-DirectionsService
 * fallback. Kept as its own client-side computation rather than a backend-relayed route: Business,
 * Customer and Rider each only ever have 1 viewer per delivery, so 3 independent Directions calls
 * per ~15s window is not a meaningful quota concern, and it avoids adding new persistence/socket
 * fields just to relay what each client can already derive itself from delivery.status + the
 * rider's already-live position. */
const LOCATION_POLL_INTERVAL_MS = 15000;
const TRACKABLE_STATUSES = ['RIDER_ACCEPTED', 'GOING_TO_PICKUP', 'ARRIVED_AT_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_CUSTOMER'];
const PRE_PICKUP_STATUSES = ['RIDER_ACCEPTED', 'GOING_TO_PICKUP', 'ARRIVED_AT_PICKUP'];

function travelModeFor(vehicleType: string | undefined): google.maps.TravelMode {
  if (vehicleType === 'BIKE') return google.maps.TravelMode.BICYCLING;
  if (vehicleType === 'WALK') return google.maps.TravelMode.WALKING;
  return google.maps.TravelMode.DRIVING;
}

interface OrderItem {
  id: string;
  nameSnapshot: string;
  quantity: number;
  unitPrice: string | number;
  subtotal: string | number;
}

interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  fulfillmentType: 'PICKUP' | 'DELIVERY';
  subtotal: string | number;
  discount: string | number;
  tax: string | number;
  serviceFee: string | number;
  deliveryFee: string | number;
  total: string | number;
  currency: string;
  notes: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  user: { firstName: string; lastName: string };
  payment: { status: string } | null;
  deliveryAddressSnapshot: { label: string; line1: string; line2: string | null; city: string } | null;
  refunds: { id: string; status: string; amount: string | number; createdAt: string }[];
}

interface DeliveryInfo {
  id: string;
  status: string;
  estimatedDistanceKm: number | null;
  estimatedDurationMinutes: number | null;
  rider: { user: { firstName: string; lastName: string }; vehicles: { type: string }[] } | null;
  pickupAddressSnapshot: { tradeName?: string; latitude?: number | null; longitude?: number | null } | null;
  deliveryAddressSnapshot: { label?: string; latitude?: number | null; longitude?: number | null } | null;
  route: { polyline: string } | null;
}

interface RiderLocation {
  latitude: number | null;
  longitude: number | null;
}

export default function BusinessOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const businessId = getActiveBusinessId();
  const [order, setOrder] = useState<OrderDetail | null | undefined>(undefined);
  const [delivery, setDelivery] = useState<DeliveryInfo | null>(null);
  const [riderLocation, setRiderLocation] = useState<RiderLocation | null>(null);
  const [liveRoute, setLiveRoute] = useState<{ lat: number; lng: number }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastRouteComputeRef = useRef(0);

  const { isLoaded: mapsLoaded } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const load = useCallback(() => {
    if (!businessId) return;
    apiFetch<OrderDetail>(`/me/business/${businessId}/orders/${params.id}`)
      .then(setOrder)
      .catch(() => setOrder(null));
    apiFetch<DeliveryInfo | null>(`/me/business/${businessId}/orders/${params.id}/delivery`)
      .then(setDelivery)
      .catch(() => setDelivery(null));
  }, [businessId, params.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Rider's live position — the concrete gap this closes: the business order-detail map used to
  // never pass a `rider` prop to MapView at all, so a rider going anywhere on this delivery was
  // simply invisible to the business, even though customer's tracking page always showed it. Same
  // fallback pattern customer's page uses: an initial REST fetch on mount/delivery-change, kept
  // live via the delivery:{id} socket room's `delivery.location.updated` (widened for Business —
  // FASE 4C — same as delivery.status.updated below).
  useEffect(() => {
    if (!businessId || !delivery?.id) {
      setRiderLocation(null);
      return;
    }
    apiFetch<RiderLocation>(`/me/business/${businessId}/orders/${params.id}/delivery/location`)
      .then(setRiderLocation)
      .catch(() => undefined);
  }, [businessId, params.id, delivery?.id]);

  // Once a Delivery exists, its progress pushes live over the existing delivery:{id} room — the
  // gateway was widened (FASE 4C) to also authorize the owning business, same room/events Rider
  // and Customer already use, no new infrastructure.
  useEffect(() => {
    const socket = connectSocket();
    if (!socket || !delivery?.id) return;
    socket.emit('subscribe:delivery', { deliveryId: delivery.id });
    const onUpdate = () => load();
    const onLocation = (payload: { latitude: number; longitude: number }) =>
      setRiderLocation({ latitude: payload.latitude, longitude: payload.longitude });
    socket.on('delivery.status.updated', onUpdate);
    socket.on('delivery.rider.assigned', onUpdate);
    socket.on('delivery.completed', onUpdate);
    socket.on('delivery.location.updated', onLocation);
    return () => {
      socket.emit('unsubscribe:delivery', { deliveryId: delivery.id });
      socket.off('delivery.status.updated', onUpdate);
      socket.off('delivery.rider.assigned', onUpdate);
      socket.off('delivery.completed', onUpdate);
      socket.off('delivery.location.updated', onLocation);
    };
  }, [delivery?.id, load]);

  // Live, current-leg-aware route (rider → business before pickup, rider → customer after) —
  // mirrors the rider app's own DirectionsService pattern exactly. Throttled the same way (15s)
  // to match the location update cadence, so this never calls the Directions API faster than the
  // position it's routing from can even change.
  useEffect(() => {
    if (
      !mapsLoaded ||
      !delivery ||
      riderLocation?.latitude == null ||
      riderLocation?.longitude == null ||
      !TRACKABLE_STATUSES.includes(delivery.status)
    ) {
      setLiveRoute(null);
      return;
    }
    const target = PRE_PICKUP_STATUSES.includes(delivery.status) ? delivery.pickupAddressSnapshot : delivery.deliveryAddressSnapshot;
    if (target?.latitude == null || target?.longitude == null) return;

    const now = Date.now();
    if (now - lastRouteComputeRef.current < LOCATION_POLL_INTERVAL_MS) return;
    lastRouteComputeRef.current = now;

    const origin = { lat: riderLocation.latitude, lng: riderLocation.longitude };
    const vehicleType = delivery.rider?.vehicles?.[0]?.type;
    new google.maps.DirectionsService().route(
      { origin, destination: { lat: target.latitude, lng: target.longitude }, travelMode: travelModeFor(vehicleType) },
      (result, status) => {
        if (status !== 'OK' || !result?.routes[0]) {
          console.error('[orders/[id]] Live route DirectionsService failed', status);
          return;
        }
        setLiveRoute(result.routes[0].overview_path.map((p) => ({ lat: p.lat(), lng: p.lng() })));
      },
    );
  }, [mapsLoaded, riderLocation, delivery]);

  // Straight-line fallback for the current leg — same rationale as the rider app: always something
  // correct-direction on screen immediately, upgraded to the real DirectionsService route once it
  // lands, instead of silently showing nothing (or the misleading static whole-trip polyline) while
  // waiting on it or if it fails.
  const fallbackRoutePath = useMemo(() => {
    if (!delivery || riderLocation?.latitude == null || riderLocation?.longitude == null || !TRACKABLE_STATUSES.includes(delivery.status)) {
      return null;
    }
    const target = PRE_PICKUP_STATUSES.includes(delivery.status) ? delivery.pickupAddressSnapshot : delivery.deliveryAddressSnapshot;
    if (target?.latitude == null || target?.longitude == null) return null;
    return [{ lat: riderLocation.latitude, lng: riderLocation.longitude }, { lat: target.latitude, lng: target.longitude }];
  }, [riderLocation, delivery]);

  const displayRoutePath = liveRoute ?? fallbackRoutePath;

  async function runAction() {
    if (!order || !businessId) return;
    const next = getOrderNextAction(order.status, order.fulfillmentType);
    if (!next) return;
    setBusy(true);
    setError(null);
    try {
      if (next.useReadyForPickupEndpoint) {
        await apiFetch(`/me/business/${businessId}/orders/${order.id}/ready-for-pickup`, { method: 'POST' });
      } else {
        await apiFetch(`/me/business/${businessId}/orders/${order.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: next.targetStatus }),
        });
      }
      load();
    } catch (err) {
      setError(err instanceof ApiError ? (API_ERROR_MESSAGES[err.code] ?? err.message) : 'No se pudo actualizar el pedido.');
    } finally {
      setBusy(false);
    }
  }

  if (order === undefined) {
    return (
      <DashboardShell>
        <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
      </DashboardShell>
    );
  }
  if (!order) {
    return (
      <DashboardShell>
        <EmptyState title="Pedido no disponible" />
      </DashboardShell>
    );
  }

  const nextAction = getOrderNextAction(order.status, order.fulfillmentType);
  // The latest Refund is the real signal once a Delivery is cancelled — Order.status has no way
  // to express it (see OrderStateMachine), so it would otherwise keep reading "Listo para retirar".
  const latestRefund = order.refunds[0] ?? null;
  const pendingRefund = latestRefund?.status === 'PENDING' ? latestRefund : null;
  const completedRefund = latestRefund?.status === 'COMPLETED' ? latestRefund : null;

  return (
    <DashboardShell>
      <button className="bingo-button secondary small" style={{ marginBottom: 16, width: 'auto' }} onClick={() => router.push('/orders')}>
        ← Pedidos
      </button>
      <header className="dashboard-page-header">
        <div>
          <div className="dashboard-page-title">{order.orderNumber}</div>
          <div className="dashboard-page-subtitle">
            {order.user.firstName} {order.user.lastName}
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 640 }}>
        <span
          className="bingo-badge"
          style={{
            background: '#f2f4f7',
            color: pendingRefund ? 'var(--bingo-warning, #b8860b)' : completedRefund ? '#54617a' : ORDER_STATUS_COLORS[order.status] ?? '#54617a',
            fontSize: 13,
          }}
        >
          {pendingRefund ? 'Por reembolsar' : completedRefund ? 'Reembolsado' : ORDER_STATUS_LABELS[order.status] ?? order.status}
        </span>
        {order.cancelReason && (
          <div className="bingo-error-banner" style={{ marginTop: 10 }}>
            Cancelado: {order.cancelReason}
          </div>
        )}
        {/* Order.status can never itself become CANCELLED once it reaches READY_FOR_PICKUP (see
            OrderStateMachine) — the latest Refund is the only signal, so it needs its own,
            equally prominent banner rather than being buried in the delivery info card below,
            where the badge above would keep saying "Listo para retirar" forever otherwise. */}
        {pendingRefund && (
          <div className="bingo-error-banner" style={{ marginTop: 10 }}>
            La entrega fue cancelada. {currencyFormatter.format(Number(pendingRefund.amount))} están por reembolsarse al cliente.
          </div>
        )}
        {completedRefund && (
          <div className="bingo-card" style={{ marginTop: 10, fontSize: 13, color: '#54617a' }}>
            La entrega fue cancelada y ya se reembolsó {currencyFormatter.format(Number(completedRefund.amount))} al cliente.
          </div>
        )}

        <h2 className="bingo-section-title">Productos</h2>
        <div className="bingo-card">
          {order.items.map((item) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span>
                {item.quantity}× {item.nameSnapshot}
              </span>
              <span>{currencyFormatter.format(Number(item.subtotal))}</span>
            </div>
          ))}
        </div>

        <h2 className="bingo-section-title">
          {order.fulfillmentType === 'PICKUP' ? 'Retiro en tienda' : 'Entrega a domicilio'}
        </h2>
        <div className="bingo-card" style={{ fontSize: 13 }}>
          {order.fulfillmentType === 'PICKUP' ? (
            'El cliente retira en la tienda.'
          ) : order.deliveryAddressSnapshot ? (
            <>
              {order.deliveryAddressSnapshot.label} — {order.deliveryAddressSnapshot.line1}
              {order.deliveryAddressSnapshot.line2 ? `, ${order.deliveryAddressSnapshot.line2}` : ''},{' '}
              {order.deliveryAddressSnapshot.city}
            </>
          ) : (
            'Sin dirección registrada'
          )}
        </div>

        {delivery && (
          <div className="bingo-card" style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{DELIVERY_STATUS_LABELS[delivery.status] ?? delivery.status}</div>
            {delivery.rider && (
              <div style={{ fontSize: 12, marginTop: 4 }}>
                Repartidor: {delivery.rider.user.firstName} {delivery.rider.user.lastName}
              </div>
            )}
            {delivery.estimatedDurationMinutes != null && (
              <div style={{ fontSize: 11, color: '#7f8ea3', marginTop: 4 }}>ETA ~{delivery.estimatedDurationMinutes} min</div>
            )}
            <div style={{ marginTop: 10 }}>
              <MapView
                pickup={
                  delivery.pickupAddressSnapshot?.latitude != null && delivery.pickupAddressSnapshot.longitude != null
                    ? { lat: delivery.pickupAddressSnapshot.latitude, lng: delivery.pickupAddressSnapshot.longitude, label: delivery.pickupAddressSnapshot.tradeName }
                    : null
                }
                destination={
                  delivery.deliveryAddressSnapshot?.latitude != null && delivery.deliveryAddressSnapshot.longitude != null
                    ? { lat: delivery.deliveryAddressSnapshot.latitude, lng: delivery.deliveryAddressSnapshot.longitude, label: 'Cliente' }
                    : null
                }
                rider={
                  riderLocation?.latitude != null && riderLocation.longitude != null
                    ? { lat: riderLocation.latitude, lng: riderLocation.longitude, vehicleType: delivery.rider?.vehicles?.[0]?.type ?? null }
                    : null
                }
                routePolyline={delivery.route?.polyline ?? null}
                routePath={displayRoutePath}
                height={200}
              />
            </div>
          </div>
        )}

        <h2 className="bingo-section-title">Resumen</h2>
        <div className="bingo-card">
          {/* El negocio solo debe ver lo que le compete: el valor del producto y su impuesto —
              nunca la tarifa de servicio ni el envío, que son ingresos de la plataforma/repartidor,
              no del negocio. Por eso "Total" aquí se calcula explícitamente como
              subtotal − descuento + impuestos, nunca order.total (que sí incluye esas tarifas). */}
          {[
            ['Subtotal', Number(order.subtotal)],
            ['Descuento', -Number(order.discount)],
            ['Impuestos', Number(order.tax)],
          ].map(([label, value]) => (
            <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#54617a' }}>
              <span>{label}</span>
              <span>{currencyFormatter.format(value as number)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, marginTop: 8 }}>
            <span>Total</span>
            <span>{currencyFormatter.format(Number(order.subtotal) - Number(order.discount) + Number(order.tax))}</span>
          </div>
          {order.payment && (
            <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 8 }}>
              Pago: {order.payment.status === 'PAID' ? 'Pagado' : order.payment.status}
            </div>
          )}
        </div>

        <div className="bingo-card" style={{ marginTop: 12, fontSize: 12, color: '#9aa5b1' }}>
          Creado: {new Date(order.createdAt).toLocaleString('es-EC')}
          <br />
          Actualizado: {new Date(order.updatedAt).toLocaleString('es-EC')}
        </div>

        {error && <div className="bingo-error-banner" style={{ marginTop: 12 }}>{error}</div>}

        {nextAction && (
          <button className="bingo-button business-action-button" style={{ marginTop: 16 }} disabled={busy} onClick={runAction}>
            {busy ? 'Procesando…' : nextAction.label}
          </button>
        )}
      </div>
    </DashboardShell>
  );
}
