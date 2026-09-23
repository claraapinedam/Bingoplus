'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import CustomerShell from '@/components/CustomerShell';
import BackButton from '@/components/BackButton';
import EmptyState from '@/components/EmptyState';
import RatingStars from '@/components/RatingStars';
import { apiFetch, ApiError } from '@/lib/api';
import { connectSocket } from '@/lib/socket';
import {
  API_ERROR_MESSAGES,
  CUSTOMER_CANCELLABLE_STATUSES,
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
  PICKUP_PROGRESS_STEPS,
} from '@/lib/orderStatus';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

interface OrderItem {
  id: string;
  nameSnapshot: string;
  quantity: number;
  unitPrice: string | number;
  subtotal: string | number;
}

interface DeliveryInfo {
  id: string;
  status: string;
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
  items: OrderItem[];
  business: { id: string; tradeName: string; addressLine: string; city: string; latitude: number | null; longitude: number | null };
  payment: { status: string } | null;
  deliveryAddressSnapshot: { label: string; line1: string; line2: string | null; city: string } | null;
  refunds: { id: string; status: string; amount: string | number; createdAt: string }[];
}

interface ReviewSummary {
  targetType: 'RIDER' | 'BUSINESS';
  rating: number;
  comment: string | null;
}

interface ReviewContext {
  eligible: boolean;
  rider: { id: string; firstName: string } | null;
  reviews: ReviewSummary[];
}

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail | null | undefined>(undefined);
  const [delivery, setDelivery] = useState<DeliveryInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewContext, setReviewContext] = useState<ReviewContext | null>(null);
  const [businessRating, setBusinessRating] = useState(0);
  const [businessComment, setBusinessComment] = useState('');
  const [riderRating, setRiderRating] = useState(0);
  const [riderComment, setRiderComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch<OrderDetail>(`/orders/${params.id}`)
      .then(setOrder)
      .catch(() => setNotFound(true));
  }, [params.id]);

  const loadReviewContext = useCallback(() => {
    apiFetch<ReviewContext>(`/orders/${params.id}/reviews`)
      .then(setReviewContext)
      .catch(() => undefined);
  }, [params.id]);

  // Order.status alone can't show a cancelled delivery — once an Order reaches READY_FOR_PICKUP,
  // OrderStateMachine has no transition to CANCELLED (a Delivery is cancelled independently, at
  // the Delivery level). Without this, an admin-cancelled delivery was completely invisible here:
  // this page kept showing "Listo para retirar" forever with no indication anything changed.
  const loadDelivery = useCallback(() => {
    apiFetch<DeliveryInfo>(`/orders/${params.id}/delivery`)
      .then(setDelivery)
      .catch(() => setDelivery(null));
  }, [params.id]);

  useEffect(() => {
    load();
    loadReviewContext();
    loadDelivery();
  }, [load, loadReviewContext, loadDelivery]);

  useEffect(() => {
    if (!delivery?.id) return;
    const socket = connectSocket();
    if (!socket) return;
    socket.emit('subscribe:delivery', { deliveryId: delivery.id });
    // A cancellation also creates a Refund on the Order (see DeliveryCancellationService), which
    // is what the badge/banner below actually reads — refetch the order itself, not just delivery.
    const onUpdate = () => {
      loadDelivery();
      load();
    };
    socket.on('delivery.status.updated', onUpdate);
    return () => {
      socket.emit('unsubscribe:delivery', { deliveryId: delivery.id });
      socket.off('delivery.status.updated', onUpdate);
    };
  }, [delivery?.id, loadDelivery, load]);

  async function submitReview() {
    if (businessRating === 0 && riderRating === 0) return;
    setSubmittingReview(true);
    setReviewError(null);
    try {
      const context = await apiFetch<ReviewContext>(`/orders/${params.id}/reviews`, {
        method: 'POST',
        body: JSON.stringify({
          business: businessRating > 0 ? { rating: businessRating, comment: businessComment || undefined } : undefined,
          rider: riderRating > 0 ? { rating: riderRating, comment: riderComment || undefined } : undefined,
        }),
      });
      setReviewContext(context);
    } catch (err) {
      setReviewError(err instanceof ApiError ? (API_ERROR_MESSAGES[err.code] ?? err.message) : 'No se pudo enviar la calificación.');
    } finally {
      setSubmittingReview(false);
    }
  }

  function openDirections() {
    if (!order || order.business.latitude == null || order.business.longitude == null) return;
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${order.business.latitude},${order.business.longitude}`, '_blank');
  }

  async function cancelOrder() {
    if (!order) return;
    setCancelling(true);
    setError(null);
    try {
      await apiFetch(`/orders/${order.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Cancelado por el cliente' }),
      });
      load();
    } catch (err) {
      setError(
        err instanceof ApiError ? (API_ERROR_MESSAGES[err.code] ?? err.message) : 'No se pudo cancelar el pedido.',
      );
    } finally {
      setCancelling(false);
    }
  }

  if (notFound) {
    return (
      <CustomerShell>
        <div className="bingo-content">
          <EmptyState title="Pedido no disponible" subtitle="No encontramos este pedido." />
        </div>
      </CustomerShell>
    );
  }

  if (order === undefined) {
    return (
      <CustomerShell>
        <div className="bingo-content">
          <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
        </div>
      </CustomerShell>
    );
  }
  if (!order) return null;

  const currentStepIndex = PICKUP_PROGRESS_STEPS.indexOf(order.status);
  const canCancel = CUSTOMER_CANCELLABLE_STATUSES.includes(order.status);
  // The latest Refund is the real signal once a Delivery is cancelled — Order.status has no way
  // to express it (see OrderStateMachine), so it would otherwise keep reading "Listo para retirar".
  const latestRefund = order.refunds[0] ?? null;
  const pendingRefund = latestRefund?.status === 'PENDING' ? latestRefund : null;
  const completedRefund = latestRefund?.status === 'COMPLETED' ? latestRefund : null;

  return (
    <CustomerShell>
      <header className="bingo-header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo%20para%20fondo%20osc.png" alt="BINGO+" className="bingo-logo-img" style={{ display: 'block', marginBottom: 10 }} />
        <BackButton onClick={() => router.push('/orders')} label="Mis pedidos" light />
        <div className="bingo-header-sub">{order.orderNumber} · {order.business.tradeName}</div>
      </header>

      <div className="bingo-content">
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

        {order.status === 'CANCELLED' ? (
          <div className="bingo-error-banner" style={{ marginTop: 10 }}>
            Este pedido fue cancelado{order.cancelReason ? `: ${order.cancelReason}` : '.'}
          </div>
        ) : pendingRefund ? (
          <div className="bingo-error-banner" style={{ marginTop: 10 }}>
            La entrega de este pedido fue cancelada. Tienes {currencyFormatter.format(Number(pendingRefund.amount))} por reembolsar —
            estamos gestionándolo.
          </div>
        ) : completedRefund ? (
          <div className="bingo-card" style={{ marginTop: 10, fontSize: 13, color: '#54617a' }}>
            Este pedido fue cancelado y ya se reembolsó {currencyFormatter.format(Number(completedRefund.amount))}.
          </div>
        ) : currentStepIndex >= 0 ? (
          <div className="bingo-card" style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between' }}>
            {PICKUP_PROGRESS_STEPS.map((step, i) => (
              <div key={step} style={{ textAlign: 'center', flex: 1 }}>
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    margin: '0 auto 4px',
                    background: i <= currentStepIndex ? 'var(--bingo-teal)' : '#e0e4ea',
                  }}
                />
                <div style={{ fontSize: 9, color: i <= currentStepIndex ? 'var(--bingo-navy)' : '#9aa5b1' }}>
                  {ORDER_STATUS_LABELS[step]}
                </div>
              </div>
            ))}
          </div>
        ) : null}

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
          {order.fulfillmentType === 'PICKUP' ? 'Retiro en tienda' : 'Dirección de entrega'}
        </h2>
        <div className="bingo-card" style={{ fontSize: 13 }}>
          {order.fulfillmentType === 'PICKUP' ? (
            <>
              {order.business.addressLine}, {order.business.city}
            </>
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

        {order.fulfillmentType === 'DELIVERY' && (
          <a
            href={`/orders/${order.id}/tracking`}
            className="bingo-card"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}
          >
            <span style={{ fontWeight: 700, fontSize: 14 }}>🛵 Seguir mi pedido en vivo</span>
            <span style={{ color: '#9aa5b1' }}>→</span>
          </a>
        )}

        {order.fulfillmentType === 'PICKUP' &&
          currentStepIndex >= 1 &&
          order.business.latitude != null &&
          order.business.longitude != null && (
            <button
              className="bingo-card"
              onClick={openDirections}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, width: '100%', border: 'none', cursor: 'pointer' }}
            >
              <span style={{ fontWeight: 700, fontSize: 14 }}>🧭 Cómo llegar</span>
              <span style={{ color: '#9aa5b1' }}>→</span>
            </button>
          )}

        <h2 className="bingo-section-title">Resumen</h2>
        <div className="bingo-card">
          {[
            ['Subtotal', Number(order.subtotal)],
            ['Descuento', -Number(order.discount)],
            ['Impuestos', Number(order.tax)],
            ['Tarifa de servicio', Number(order.serviceFee)],
            ['Envío', Number(order.deliveryFee)],
          ].map(([label, value]) => (
            <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#54617a' }}>
              <span>{label}</span>
              <span>{currencyFormatter.format(value as number)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, marginTop: 8 }}>
            <span>Total</span>
            <span>{currencyFormatter.format(Number(order.total))}</span>
          </div>
          {order.payment && (
            <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 8 }}>
              Pago: {order.payment.status === 'PAID' ? 'Pagado' : order.payment.status}
            </div>
          )}
        </div>

        {order.status === 'COMPLETED' && reviewContext?.eligible && (() => {
          const businessReview = reviewContext.reviews.find((r) => r.targetType === 'BUSINESS');
          const riderReview = reviewContext.reviews.find((r) => r.targetType === 'RIDER');
          const showRider = !!reviewContext.rider;
          const allDone = !!businessReview && (!showRider || !!riderReview);

          return (
            <>
              <h2 className="bingo-section-title">Califica tu pedido</h2>
              <div className="bingo-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{order.business.tradeName}</div>
                  {businessReview ? (
                    <RatingStars value={businessReview.rating} readOnly />
                  ) : (
                    <RatingStars value={businessRating} onChange={setBusinessRating} />
                  )}
                  {!businessReview && businessRating > 0 && (
                    <input
                      className="bingo-input"
                      style={{ marginTop: 8 }}
                      placeholder="Comentario (opcional)"
                      maxLength={500}
                      value={businessComment}
                      onChange={(e) => setBusinessComment(e.target.value)}
                    />
                  )}
                  {businessReview?.comment && (
                    <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 6 }}>{businessReview.comment}</div>
                  )}
                </div>

                {showRider && (
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Repartidor: {reviewContext.rider!.firstName}</div>
                    {riderReview ? (
                      <RatingStars value={riderReview.rating} readOnly />
                    ) : (
                      <RatingStars value={riderRating} onChange={setRiderRating} />
                    )}
                    {!riderReview && riderRating > 0 && (
                      <input
                        className="bingo-input"
                        style={{ marginTop: 8 }}
                        placeholder="Comentario (opcional)"
                        maxLength={500}
                        value={riderComment}
                        onChange={(e) => setRiderComment(e.target.value)}
                      />
                    )}
                    {riderReview?.comment && <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 6 }}>{riderReview.comment}</div>}
                  </div>
                )}

                {allDone && <div style={{ fontSize: 12, color: 'var(--bingo-success)' }}>¡Gracias por tu calificación!</div>}
                {reviewError && <div className="bingo-error-banner">{reviewError}</div>}

                {!allDone && (
                  <button
                    className="bingo-button"
                    disabled={
                      submittingReview ||
                      ((!!businessReview || businessRating === 0) && (!!riderReview || !showRider || riderRating === 0))
                    }
                    onClick={submitReview}
                  >
                    {submittingReview ? 'Enviando…' : 'Enviar calificación'}
                  </button>
                )}
              </div>
            </>
          );
        })()}

        {error && <div className="bingo-error-banner" style={{ marginTop: 12 }}>{error}</div>}

        {canCancel && (
          <button
            className="bingo-button secondary"
            style={{ marginTop: 16, color: 'var(--bingo-error)' }}
            disabled={cancelling}
            onClick={cancelOrder}
          >
            {cancelling ? 'Cancelando…' : 'Cancelar pedido'}
          </button>
        )}
      </div>
    </CustomerShell>
  );
}
