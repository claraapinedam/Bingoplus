import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DeliveryAssignmentAction, DeliveryAssignmentSource, DeliveryStatus, RiderAvailabilityStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DeliveryStateMachine } from './delivery-state-machine';
import { DeliveryGateway } from './delivery.gateway';

export type DeliveryCancellationActor = 'RIDER' | 'ADMIN' | 'SYSTEM';

/**
 * §54: distinguishes who cancelled and why (folded into the DeliveryAssignmentHistory `reason`
 * text, since actor-typed history is a schema addition left for the next refinement pass — see
 * Final Report). Never assumes a refund — Order-level cancellation/refund is already governed by
 * CancellationService/RefundService (FASE 3) and, structurally, can no longer run once a
 * Delivery exists (OrderStateMachine has no CANCELLED transition out of READY_FOR_PICKUP).
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
