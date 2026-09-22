'use client';

import { useCallback, useEffect, useState } from 'react';
import RiderShell from '@/components/RiderShell';
import { apiFetch, ApiError, getUserLocation } from '@/lib/api';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import { API_ERROR_MESSAGES, DELIVERY_STATUS_LABELS, RIDER_ACTIVE_STATUSES } from '@/lib/deliveryStatus';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

interface RiderProfile {
  id: string;
  accountStatus: 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED' | 'INACTIVE';
  availabilityStatus: 'OFFLINE' | 'AVAILABLE' | 'BUSY';
  ratingAvg: number;
  deliveriesCompleted: number;
  user: { firstName: string; lastName: string };
}

interface DeliverySummary {
  id: string;
  status: string;
  // The rider's own commission for this delivery — never the gross fare/tariff. Do not read a
  // `deliveryFee` field here even if the API response includes one: a rider must never see it.
  riderNetAmount: number;
  createdAt: string;
  pickupAddressSnapshot: { tradeName?: string };
  order: { orderNumber: string };
}

const ACCOUNT_STATUS_LABELS: Record<string, string> = {
  PENDING_APPROVAL: 'Tu cuenta está en revisión. Te avisaremos cuando sea aprobada.',
  SUSPENDED: 'Tu cuenta está suspendida. Contacta a soporte.',
  REJECTED: 'Tu solicitud no fue aprobada. Contacta a soporte.',
  INACTIVE: 'Tu cuenta está inactiva. Contacta a soporte.',
};

export default function RiderHomePage() {
  const [profile, setProfile] = useState<RiderProfile | null | undefined>(undefined);
  const [deliveries, setDeliveries] = useState<DeliverySummary[]>([]);
  const [togglingAvailability, setTogglingAvailability] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const load = useCallback(() => {
    apiFetch<RiderProfile>('/rider/profile').then(setProfile).catch(() => setProfile(null));
    apiFetch<DeliverySummary[]>('/rider/deliveries').then(setDeliveries).catch(() => setDeliveries([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: a new offer lands via `delivery.offer` on the rider's personal room (auto-joined
  // server-side on connect — see DeliveryGateway.handleConnection). Falls back to nothing extra
  // needed since `load()` above already ran once; a manual refresh always still works.
  useEffect(() => {
    const socket = connectSocket();
    if (!socket) return;
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onOffer = () => load();
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('delivery.offer', onOffer);
    setConnected(socket.connected);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('delivery.offer', onOffer);
    };
  }, [load]);

  useEffect(() => () => disconnectSocket(), []);

  async function toggleAvailability() {
    if (!profile) return;
    setTogglingAvailability(true);
    setError(null);
    try {
      if (profile.availabilityStatus === 'OFFLINE') {
        const coords = await getUserLocation();
        if (!coords) {
          setError('No pudimos obtener tu ubicación. Actívala en el navegador para conectarte.');
          setTogglingAvailability(false);
          return;
        }
        await apiFetch('/rider/location', { method: 'POST', body: JSON.stringify(coords) });
        await apiFetch('/rider/availability', {
          method: 'POST',
          body: JSON.stringify({ availabilityStatus: 'AVAILABLE' }),
        });
      } else {
        await apiFetch('/rider/availability', {
          method: 'POST',
          body: JSON.stringify({ availabilityStatus: 'OFFLINE' }),
        });
      }
      load();
    } catch (err) {
      setError(
        err instanceof ApiError ? (API_ERROR_MESSAGES[err.code] ?? err.message) : 'No se pudo actualizar tu estado.',
      );
    } finally {
      setTogglingAvailability(false);
    }
  }

  if (profile === undefined) {
    return (
      <RiderShell>
        <div className="bingo-content">
          <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
        </div>
      </RiderShell>
    );
  }
  if (!profile) return null;

  const offer = deliveries.find((d) => d.status === 'RIDER_ASSIGNED');
  const active = deliveries.find((d) => RIDER_ACTIVE_STATUSES.includes(d.status) && d.status !== 'RIDER_ASSIGNED');
  const recentCompleted = deliveries.filter((d) => d.status === 'DELIVERED').slice(0, 3);
  const todayEarnings = deliveries
    .filter((d) => d.status === 'DELIVERED' && new Date(d.createdAt).toDateString() === new Date().toDateString())
    .reduce((sum, d) => sum + Number(d.riderNetAmount), 0);

  return (
    <RiderShell>
      <header className="bingo-header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo%20para%20fondo%20osc.png" alt="BINGO+" className="bingo-logo-img" />
        <div className="bingo-header-sub">
          Hola, {profile.user.firstName} · ⭐ {profile.ratingAvg.toFixed(1)} · {profile.deliveriesCompleted} entregas completadas
        </div>
      </header>

      <div className="bingo-content">
        {!connected && (
          <div className="rider-connection-banner" style={{ marginBottom: 12 }}>
            Conectando en tiempo real… si tarda, desliza para actualizar.
          </div>
        )}

        {profile.accountStatus !== 'ACTIVE' ? (
          <div className="bingo-error-banner">{ACCOUNT_STATUS_LABELS[profile.accountStatus]}</div>
        ) : (
          <button
            className={`rider-availability-toggle ${profile.availabilityStatus.toLowerCase()}`}
            style={{ width: '100%', border: 'none', cursor: 'pointer' }}
            onClick={toggleAvailability}
            disabled={togglingAvailability || profile.availabilityStatus === 'BUSY'}
          >
            <span style={{ fontWeight: 800, fontSize: 15 }}>
              {profile.availabilityStatus === 'OFFLINE' && 'Desconectado'}
              {profile.availabilityStatus === 'AVAILABLE' && 'Disponible'}
              {profile.availabilityStatus === 'BUSY' && 'En una entrega'}
            </span>
            {profile.availabilityStatus !== 'BUSY' && (
              <span style={{ fontSize: 13, fontWeight: 700 }}>
                {togglingAvailability ? '...' : profile.availabilityStatus === 'OFFLINE' ? 'Conectarme →' : 'Desconectarme →'}
              </span>
            )}
          </button>
        )}

        {error && <div className="bingo-error-banner" style={{ marginTop: 12 }}>{error}</div>}

        {offer && (
          <>
            <h2 className="bingo-section-title">Nueva entrega disponible</h2>
            <a href={`/deliveries/${offer.id}`} className="bingo-card" style={{ display: 'block', border: '2px solid var(--bingo-coral)' }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{offer.pickupAddressSnapshot.tradeName ?? 'Negocio'}</div>
              <div style={{ fontSize: 12, color: '#7f8ea3', margin: '4px 0' }}>Pedido {offer.order.orderNumber}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--bingo-coral)' }}>Ver oferta →</div>
            </a>
          </>
        )}

        {active && (
          <>
            <h2 className="bingo-section-title">Entrega activa</h2>
            <a href={`/deliveries/${active.id}`} className="bingo-card" style={{ display: 'block' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{active.pickupAddressSnapshot.tradeName ?? 'Negocio'}</div>
                  <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 2 }}>Pedido {active.order.orderNumber}</div>
                </div>
                <span className="bingo-badge" style={{ background: '#f2f4f7', color: 'var(--bingo-teal)' }}>
                  {DELIVERY_STATUS_LABELS[active.status] ?? active.status}
                </span>
              </div>
            </a>
          </>
        )}

        {!offer && !active && profile.accountStatus === 'ACTIVE' && (
          <p style={{ fontSize: 13, color: '#7f8ea3', textAlign: 'center', marginTop: 24 }}>
            {profile.availabilityStatus === 'AVAILABLE'
              ? 'Esperando una nueva entrega…'
              : 'Conéctate para empezar a recibir entregas.'}
          </p>
        )}

        <h2 className="bingo-section-title">Resumen de hoy</h2>
        <div className="bingo-card" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 12, color: '#7f8ea3' }}>Ganado hoy</div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{currencyFormatter.format(todayEarnings)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: '#7f8ea3' }}>Entregas hoy</div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>
              {deliveries.filter((d) => d.status === 'DELIVERED' && new Date(d.createdAt).toDateString() === new Date().toDateString()).length}
            </div>
          </div>
        </div>

        {recentCompleted.length > 0 && (
          <>
            <h2 className="bingo-section-title">Actividad reciente</h2>
            {recentCompleted.map((d) => (
              <div key={d.id} className="bingo-card" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13 }}>{d.pickupAddressSnapshot.tradeName ?? 'Negocio'}</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{currencyFormatter.format(Number(d.riderNetAmount))}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </RiderShell>
  );
}
