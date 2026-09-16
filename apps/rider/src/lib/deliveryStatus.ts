// Mirrors DeliveryStatus exactly as defined in apps/api/prisma/schema.prisma — no invented
// states. Order.status is a *different*, separate state machine (see OrderStatus in the same
// schema); the Rider App only ever deals with Delivery.status.
export const DELIVERY_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Preparando envío',
  SEARCHING_RIDER: 'Buscando repartidor',
  RIDER_ASSIGNED: 'Oferta pendiente',
  RIDER_ACCEPTED: 'Aceptada',
  GOING_TO_PICKUP: 'Yendo al negocio',
  ARRIVED_AT_PICKUP: 'En el negocio',
  PICKED_UP: 'Pedido recogido',
  IN_TRANSIT: 'En camino al cliente',
  ARRIVED_AT_CUSTOMER: 'En la dirección',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
  FAILED: 'No se pudo completar',
};

export const DELIVERY_STATUS_COLORS: Record<string, string> = {
  PENDING: '#7f8ea3',
  SEARCHING_RIDER: 'var(--bingo-warning)',
  RIDER_ASSIGNED: 'var(--bingo-coral)',
  RIDER_ACCEPTED: 'var(--bingo-teal)',
  GOING_TO_PICKUP: 'var(--bingo-warning)',
  ARRIVED_AT_PICKUP: 'var(--bingo-warning)',
  PICKED_UP: 'var(--bingo-teal)',
  IN_TRANSIT: 'var(--bingo-warning)',
  ARRIVED_AT_CUSTOMER: 'var(--bingo-warning)',
  DELIVERED: 'var(--bingo-success)',
  CANCELLED: 'var(--bingo-error)',
  FAILED: 'var(--bingo-error)',
};

/** Statuses where the delivery is "active" for this rider — drives whether Home shows it as the
 * current job and whether live location tracking should be running (§35 — only while active). */
export const RIDER_ACTIVE_STATUSES = [
  'RIDER_ASSIGNED',
  'RIDER_ACCEPTED',
  'GOING_TO_PICKUP',
  'ARRIVED_AT_PICKUP',
  'PICKED_UP',
  'IN_TRANSIT',
  'ARRIVED_AT_CUSTOMER',
];

/** The one primary action button for each stage, matching the exact backend endpoints:
 * POST /rider/deliveries/:id/{action}. GOING_TO_PICKUP has no button of its own — accepting
 * already combines RIDER_ACCEPTED + GOING_TO_PICKUP server-side (§57 lists 8 rider actions, not 9). */
export const DELIVERY_NEXT_ACTION: Record<string, { action: string; label: string } | null> = {
  RIDER_ASSIGNED: null, // handled separately — Accept/Reject, not a single "next" button
  RIDER_ACCEPTED: { action: 'arrived-pickup', label: 'HE LLEGADO AL NEGOCIO' },
  GOING_TO_PICKUP: { action: 'arrived-pickup', label: 'HE LLEGADO AL NEGOCIO' },
  ARRIVED_AT_PICKUP: { action: 'picked-up', label: 'PICKUP REALIZADO' },
  PICKED_UP: { action: 'start', label: 'INICIAR ENTREGA' },
  IN_TRANSIT: { action: 'arrived-customer', label: 'HE LLEGADO AL CLIENTE' },
  ARRIVED_AT_CUSTOMER: null, // handled separately — OTP input + complete
};

export const API_ERROR_MESSAGES: Record<string, string> = {
  DELIVERY_OTP_INVALID: 'Código incorrecto. Pídele el código al cliente de nuevo.',
  DELIVERY_OTP_EXPIRED: 'El código expiró. Contacta a soporte.',
  DELIVERY_OTP_LOCKED: 'Demasiados intentos incorrectos. Contacta a soporte.',
  DELIVERY_NOT_REJECTABLE: 'Esta entrega ya no está disponible para rechazar.',
  DELIVERY_NOT_REASSIGNABLE: 'Esta entrega ya no se puede reasignar.',
  RIDER_ACCOUNT_NOT_ACTIVE: 'Tu cuenta debe estar aprobada y activa para conectarte.',
  RIDER_LOCATION_REQUIRED: 'Comparte tu ubicación antes de conectarte.',
  INVALID_DELIVERY_TRANSITION: 'Esta acción ya no está disponible para esta entrega.',
};
