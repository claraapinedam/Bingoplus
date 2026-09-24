import { BadRequestException, Injectable } from '@nestjs/common';
import { DeliveryStatus } from '@prisma/client';

/**
 * §15/16: the exhaustive legal-transition map for a Delivery's own logistics lifecycle —
 * completely separate from OrderStateMachine (see the OrderStatus comment in schema.prisma for
 * how the two are synchronized). Cancellation is only ever a direct transition before PICKED_UP
 * (§54) — once the order is physically in the rider's hands, the mechanism is a DeliveryIncident
 * (§51/52), not a state rollback.
 */
const TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  PENDING: [DeliveryStatus.SEARCHING_RIDER, DeliveryStatus.CANCELLED],
  SEARCHING_RIDER: [DeliveryStatus.RIDER_ASSIGNED, DeliveryStatus.CANCELLED, DeliveryStatus.FAILED],
  RIDER_ASSIGNED: [DeliveryStatus.RIDER_ACCEPTED, DeliveryStatus.SEARCHING_RIDER, DeliveryStatus.CANCELLED],
  RIDER_ACCEPTED: [DeliveryStatus.GOING_TO_PICKUP, DeliveryStatus.CANCELLED],
  GOING_TO_PICKUP: [DeliveryStatus.ARRIVED_AT_PICKUP, DeliveryStatus.CANCELLED],
  ARRIVED_AT_PICKUP: [DeliveryStatus.PICKED_UP, DeliveryStatus.CANCELLED],
  PICKED_UP: [DeliveryStatus.IN_TRANSIT],
  IN_TRANSIT: [DeliveryStatus.ARRIVED_AT_CUSTOMER],
  ARRIVED_AT_CUSTOMER: [DeliveryStatus.DELIVERED],
  DELIVERED: [],
  CANCELLED: [],
  FAILED: [],
};

/** §54: cancellation is only reachable while the delivery hasn't been physically picked up yet. */
const CANCELLABLE_STATES: DeliveryStatus[] = [
  DeliveryStatus.PENDING,
  DeliveryStatus.SEARCHING_RIDER,
  DeliveryStatus.RIDER_ASSIGNED,
  DeliveryStatus.RIDER_ACCEPTED,
  DeliveryStatus.GOING_TO_PICKUP,
  DeliveryStatus.ARRIVED_AT_PICKUP,
];

@Injectable()
export class DeliveryStateMachine {
  canTransition(from: DeliveryStatus, to: DeliveryStatus): boolean {
    return TRANSITIONS[from]?.includes(to) ?? false;
  }

  assertTransition(from: DeliveryStatus, to: DeliveryStatus): void {
    if (!this.canTransition(from, to)) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_DELIVERY_TRANSITION',
          message: `Cannot move a delivery from ${from} to ${to}.`,
          details: { from, to, allowed: TRANSITIONS[from] ?? [] },
        },
      });
    }
  }

  isCancellable(status: DeliveryStatus): boolean {
    return CANCELLABLE_STATES.includes(status);
  }

  /** A status with no outgoing transitions in TRANSITIONS (DELIVERED/CANCELLED/FAILED) — read off
   * the same map rather than a second hardcoded list, so it can never drift from what
   * canTransition/assertTransition already treat as terminal. Used by DeliveryChatService to close
   * the rider<->customer chat the instant a delivery is truly over, without a separate
   * open/closed field on either Delivery or the chat itself. */
  isTerminal(status: DeliveryStatus): boolean {
    return TRANSITIONS[status]?.length === 0;
  }
}
