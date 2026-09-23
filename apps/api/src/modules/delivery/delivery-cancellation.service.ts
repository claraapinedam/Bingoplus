import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DeliveryAssignmentAction, DeliveryAssignmentSource, DeliveryStatus, Prisma, RefundStatus, RiderAvailabilityStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DeliveryStateMachine } from './delivery-state-machine';
import { DeliveryGateway } from './delivery.gateway';

export type DeliveryCancellationActor = 'RIDER' | 'ADMIN' | 'SYSTEM';

const REFUNDABLE_PAYMENT_STATUSES = ['PAID', 'PARTIALLY_REFUNDED'];

/**
 * §54: distinguishes who cancelled and why (folded into the DeliveryAssignmentHistory `reason`
 * text, since actor-typed history is a schema addition left for the next refinement pass — see
 * Final Report). A cancelled delivery for an order that was already paid always owes a refund —
 * this creates a PENDING Refund row for the outstanding amount directly (not via
 * PaymentService.refundPayment, which calls the payment provider and completes instantly in
 * Sandbox mode; here the actual refund is handled off-system, e.g. a bank transfer, so it must
 * stay PENDING until an admin explicitly marks it done — see RefundService.completeManual).
 */
@Injectable()
export class DeliveryCancellationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: DeliveryStateMachine,
    private readonly gateway: DeliveryGateway,
  ) {}

  async cancel(deliveryId: string, actor: DeliveryCancellationActor, reason?: string) {
    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) throw new NotFoundException('Delivery not found');
    if (!this.stateMachine.isCancellable(delivery.status)) {
      throw new BadRequestException({
        error: {
          code: 'DELIVERY_NOT_CANCELLABLE',
          message: 'This delivery can no longer be cancelled — it has already been picked up.',
        },
      });
    }

    const cancelled = await this.prisma.$transaction(async (tx) => {
      await tx.delivery.update({
        where: { id: deliveryId },
        data: { status: DeliveryStatus.CANCELLED, cancelledAt: new Date() },
      });
      await tx.deliveryAssignmentHistory.create({
        data: {
          deliveryId,
          riderId: delivery.riderId,
          action: DeliveryAssignmentAction.CANCELLED,
          reason: reason ? `[${actor}] ${reason}` : `Cancelled by ${actor}`,
          source: actor === 'ADMIN' ? DeliveryAssignmentSource.ADMIN : DeliveryAssignmentSource.AUTO,
        },
      });
      if (delivery.riderId) {
        await tx.rider.update({
          where: { id: delivery.riderId },
          data: { availabilityStatus: RiderAvailabilityStatus.AVAILABLE },
        });
      }

      const order = await tx.order.findUnique({ where: { id: delivery.orderId }, include: { payment: true } });
      if (order?.payment && REFUNDABLE_PAYMENT_STATUSES.includes(order.payment.status)) {
        const alreadyRefunded = await tx.refund.aggregate({
          where: { paymentId: order.payment.id, status: RefundStatus.COMPLETED },
          _sum: { amount: true },
        });
        const outstanding = order.payment.amount.minus(alreadyRefunded._sum.amount ?? new Prisma.Decimal(0));
        if (outstanding.gt(0)) {
          await tx.refund.create({
            data: {
              paymentId: order.payment.id,
              orderId: order.id,
              amount: outstanding,
              reason: 'Entrega cancelada',
              requestedBy: actor,
              status: RefundStatus.PENDING,
            },
          });
        }
      }

      return tx.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
    });

    // Order.status structurally can't reflect this (OrderStateMachine has no transition out of
    // READY_FOR_PICKUP other than COMPLETED — see its own header comment), so this push is the
    // only realtime signal the customer/business tracking screens get. Without it, cancelling a
    // delivery was invisible to both until they happened to reload — no exception thrown, just
    // silence (this class never had a DeliveryGateway dependency at all before).
    this.gateway.emitStatusUpdated(deliveryId, DeliveryStatus.CANCELLED);

    return cancelled;
  }
}
