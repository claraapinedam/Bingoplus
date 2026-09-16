import { Injectable } from '@nestjs/common';
import { DeliveryStatus, OrderStatus, Prisma } from '@prisma/client';
import { OrderStateMachine } from '../orders/order-state-machine';

/**
 * §67: the one and only place authorized to move Order.status in response to a Delivery event —
 * no other module reaches across domains to touch both. Today the only synchronization point is
 * DELIVERED -> COMPLETED (Order sits at READY_FOR_PICKUP for the rest of the delivery lifecycle,
 * per the OrderStatus comment in schema.prisma).
 */
@Injectable()
export class DeliverySyncService {
  constructor(private readonly stateMachine: OrderStateMachine) {}

  async onDeliveryStatusChanged(tx: Prisma.TransactionClient, orderId: string, newStatus: DeliveryStatus): Promise<void> {
    if (newStatus !== DeliveryStatus.DELIVERED) return;

    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (this.stateMachine.canTransition(order.status, OrderStatus.COMPLETED)) {
      await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.COMPLETED } });
    }
  }
}
