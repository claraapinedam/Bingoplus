// Mirrors OrderStatus exactly as defined in apps/api/prisma/schema.prisma — no invented states.
// The business only ever drives CONFIRMED/PREPARING/READY_FOR_PICKUP; PAID and COMPLETED/CANCELLED
// are payment- or delivery-driven and shown read-only here.
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
  PAID: 'var(--bingo-coral)',
  CONFIRMED: 'var(--bingo-teal)',
  PREPARING: 'var(--bingo-warning)',
  READY_FOR_PICKUP: 'var(--bingo-success)',
  COMPLETED: 'var(--bingo-success)',
  CANCELLED: 'var(--bingo-error)',
};

/** The status tabs on the Pedidos list — "Nuevos" surfaces PAID orders (need action), the rest
 * are self-explanatory operational buckets. All map to real OrderStatus values, nothing invented. */
export const STATUS_TABS = [
  { value: '', label: 'Todos' },
  { value: 'PAID', label: 'Nuevos' },
  { value: 'CONFIRMED', label: 'Confirmados' },
  { value: 'PREPARING', label: 'En preparación' },
  { value: 'READY_FOR_PICKUP', label: 'Listos' },
  { value: 'COMPLETED', label: 'Completados' },
  { value: 'CANCELLED', label: 'Cancelados' },
];

export interface OrderNextAction {
  label: string;
  targetStatus: string;
  useReadyForPickupEndpoint?: boolean;
}

/** The one primary action per status — PATCH .../orders/:id/status for CONFIRMED/PREPARING/
 * COMPLETED, and the dedicated ready-for-pickup endpoint (which also creates the Delivery for
 * DELIVERY orders) for that step — matching exactly what OrdersService/BusinessDeliveryController
 * accept. READY_FOR_PICKUP branches by fulfillmentType: a PICKUP order is closed out by the
 * business when the customer physically collects it (OrdersService already allows PICKUP straight
 * to COMPLETED via the generic PATCH — only DELIVERY is blocked there, driven by the Delivery
 * flow instead), so this can't be a flat lookup by status alone. */
export function getOrderNextAction(status: string, fulfillmentType: 'PICKUP' | 'DELIVERY'): OrderNextAction | null {
  switch (status) {
    case 'PAID':
      return { label: 'ACEPTAR PEDIDO', targetStatus: 'CONFIRMED' };
    case 'CONFIRMED':
      return { label: 'EMPEZAR PREPARACIÓN', targetStatus: 'PREPARING' };
    case 'PREPARING':
      return { label: 'LISTO PARA RETIRAR', targetStatus: 'READY_FOR_PICKUP', useReadyForPickupEndpoint: true };
    case 'READY_FOR_PICKUP':
      return fulfillmentType === 'PICKUP' ? { label: 'PEDIDO RETIRADO', targetStatus: 'COMPLETED' } : null;
    default:
      return null;
  }
}

// Mirrors DeliveryStatus exactly — shown read-only inside Order Detail once a Delivery exists,
// never a second state machine.
export const DELIVERY_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Preparando envío',
  SEARCHING_RIDER: 'Buscando repartidor',
  RIDER_ASSIGNED: 'Repartidor asignado',
  RIDER_ACCEPTED: 'Repartidor confirmado',
  GOING_TO_PICKUP: 'Repartidor en camino a la tienda',
  ARRIVED_AT_PICKUP: 'Repartidor en la tienda',
  PICKED_UP: 'Pedido recogido',
  IN_TRANSIT: 'En camino',
  ARRIVED_AT_CUSTOMER: 'Repartidor en la dirección',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
  FAILED: 'No se pudo completar',
};

export const API_ERROR_MESSAGES: Record<string, string> = {
  STATUS_NOT_BUSINESS_SETTABLE: 'Esta acción no está disponible para este pedido.',
  USE_DELIVERY_FLOW: 'Este pedido ya está en el flujo de entrega.',
  INVALID_ORDER_TRANSITION: 'Este pedido ya no puede avanzar por esa vía — puede que otra persona ya lo haya actualizado.',
  ORDER_NOT_READY: 'El pedido todavía no está listo para este paso.',
};
