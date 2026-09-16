import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

/**
 * §30/31 (FASE 3) + §16/§67 (FASE 4): the exhaustive legal-transition map for a Marketplace
 * Order. READY_FOR_PICKUP -> COMPLETED covers both fulfillment types at the Order level: for
 * PICKUP it's the whole story; for DELIVERY, Order sits at READY_FOR_PICKUP for the entire
 * delivery lifecycle (tracked separately on Delivery.status) and DeliverySyncService is the only
 * thing that drives it on to COMPLETED, once Delivery reaches DELIVERED.
 */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  CREATED: [OrderStatus.PAYMENT_PENDING, OrderStatus.CANCELLED],
  PAYMENT_PENDING: [OrderStatus.PAID, OrderStatus.CANCELLED],
  PAID: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  CONFIRMED: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  PREPARING: [OrderStatus.READY_FOR_PICKUP],
  READY_FOR_PICKUP: [OrderStatus.COMPLETED],
  COMPLETED: [],
  CANCELLED: [],
};

/** Once PREPARING starts, a customer can no longer self-cancel (§35) — Business must be asked directly. */
const CUSTOMER_CANCELLABLE_STATES: OrderStatus[] = [
  OrderStatus.CREATED,
  OrderStatus.PAYMENT_PENDING,
  OrderStatus.PAID,
  OrderStatus.CONFIRMED,
];

@Injectable()
export class OrderStateMachine {
  canTransition(from: OrderStatus, to: OrderStatus): boolean {
    return TRANSITIONS[from]?.includes(to) ?? false;
  }

  /** Throws with a clear message rather than silently no-op'ing on an illegal transition. */
  assertTransition(from: OrderStatus, to: OrderStatus): void {
    if (!this.canTransition(from, to)) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_ORDER_TRANSITION',
          message: `Cannot move an order from ${from} to ${to}.`,
          details: { from, to, allowed: TRANSITIONS[from] ?? [] },
        },
      });
    }
  }

  isCustomerCancellable(status: OrderStatus): boolean {
    return CUSTOMER_CANCELLABLE_STATES.includes(status);
  }
}
