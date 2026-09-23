// FASE 4: Order.status no longer carries delivery-substates (SEARCHING_RIDER..DELIVERED) — that
// granularity now lives on Delivery.status instead (see the customer-facing tracking endpoints,
// GET /orders/:id/tracking and /deliveries/:id/status). Order.status stays at READY_FOR_PICKUP
// for the whole delivery lifecycle and only moves to COMPLETED once the delivery is DELIVERED.
export const ORDER_STATUS_LABELS: Record<string, string> = {
  CREATED: 'Creada',
  PAYMENT_PENDING: 'Pago pendiente',
  PAID: 'Pagada',
  CONFIRMED: 'Confirmada',
  PREPARING: 'Preparando',
  READY_FOR_PICKUP: 'Lista para retiro',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
};

export const ORDER_STATUS_COLORS: Record<string, string> = {
  CREATED: '#7f8ea3',
  PAYMENT_PENDING: 'var(--bingo-warning)',
  PAID: 'var(--bingo-teal)',
  CONFIRMED: 'var(--bingo-teal)',
  PREPARING: 'var(--bingo-warning)',
  READY_FOR_PICKUP: 'var(--bingo-success)',
  COMPLETED: 'var(--bingo-success)',
  CANCELLED: 'var(--bingo-error)',
};

/** Delivery.status labels (FASE 4) — separate from ORDER_STATUS_LABELS above since it's now a
 * distinct state machine. Used by a future delivery-tracking screen (FASE 5 builds the full
 * Customer App UI; FASE 4 only guarantees the API contract these would bind to). */
export const DELIVERY_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Preparando envío',
  SEARCHING_RIDER: 'Buscando el mejor repartidor cercano...',
  RIDER_ASSIGNED: 'Repartidor asignado, esperando confirmación',
  RIDER_ACCEPTED: 'Repartidor confirmado',
  GOING_TO_PICKUP: 'Tu repartidor está llegando al negocio',
  ARRIVED_AT_PICKUP: 'Repartidor en la tienda',
  PICKED_UP: 'Pedido recogido',
  IN_TRANSIT: 'En camino',
  ARRIVED_AT_CUSTOMER: 'Repartidor en la dirección',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
  FAILED: 'No se pudo completar',
};

/** Statuses where the customer self-cancel button is shown. The backend (§35) technically still
 * allows a customer to cancel up through CONFIRMED, but the UI intentionally stops offering the
 * one-tap cancel action once the business has confirmed the order — cancelling at that point
 * should go through support, not be one accidental tap away. */
export const CUSTOMER_CANCELLABLE_STATUSES = ['CREATED', 'PAYMENT_PENDING', 'PAID'];

/** Steps of the PICKUP happy path, in order — used to render a simple progress stepper. */
export const PICKUP_PROGRESS_STEPS = ['PAID', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'COMPLETED'];

export const API_ERROR_MESSAGES: Record<string, string> = {
  CART_EMPTY: 'Tu carrito está vacío.',
  BUSINESS_NOT_ACTIVE: 'Esta tienda ya no está aceptando pedidos.',
  BUSINESS_OFFLINE: 'Esta tienda está desconectada en este momento.',
  BUSINESS_NOT_SELLING: 'Esta tienda ya no vende productos.',
  PRODUCT_UNAVAILABLE: 'Uno de los productos ya no está disponible.',
  PRODUCT_OUT_OF_STOCK: 'Uno de los productos ya no tiene stock suficiente.',
  FULFILLMENT_NOT_AVAILABLE: 'Esta tienda no ofrece esa opción de entrega.',
  ADDRESS_REQUIRED: 'Selecciona una dirección de entrega.',
  ORDER_NOT_CANCELLABLE: 'Este pedido ya no se puede cancelar — el negocio ya lo está preparando.',
  NO_RATING_PROVIDED: 'Elige al menos una calificación.',
  ORDER_NOT_COMPLETED: 'Podrás calificar este pedido una vez completado.',
  NO_RIDER_TO_RATE: 'Este pedido no tuvo un repartidor asignado.',
  ALREADY_REVIEWED: 'Ya calificaste este pedido.',
};
