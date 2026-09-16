import { Injectable } from '@nestjs/common';
import { DeliveryAssignmentAction, DeliveryAssignmentSource, DeliveryStatus, Prisma, RiderAvailabilityStatus } from '@prisma/client';
import { DeliveryStateMachine } from './delivery-state-machine';
import { DispatchService } from './dispatch.service';

/**
 * §22/23: what happens after a rider rejects, times out, or otherwise can't take a delivery —
 * frees the rider, records why (DeliveryAssignmentHistory), and tries the next best candidate,
 * excluding everyone already offered this delivery so the same rider is never re-offered.
 */
@Injectable()
export class DeliveryReassignmentService {
  constructor(
    private readonly stateMachine: DeliveryStateMachine,
    private readonly dispatch: DispatchService,
  ) {}

  async reassign(
    tx: Prisma.TransactionClient,
    deliveryId: string,
    action: typeof DeliveryAssignmentAction.REJECTED | typeof DeliveryAssignmentAction.TIMED_OUT,
    reason: string | undefined,
  ): Promise<string | null> {
    const delivery = await tx.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
    this.stateMachine.assertTransition(delivery.status, DeliveryStatus.SEARCHING_RIDER);

    const previousRiderId = delivery.riderId;

    await tx.delivery.update({
      where: { id: deliveryId },
      data: { riderId: null, status: DeliveryStatus.SEARCHING_RIDER },
    });
    await tx.deliveryAssignmentHistory.create({
      data: { deliveryId, riderId: previousRiderId, action, reason, source: DeliveryAssignmentSource.AUTO },
    });
    if (previousRiderId) {
      await tx.rider.update({
        where: { id: previousRiderId },
        data: { availabilityStatus: RiderAvailabilityStatus.AVAILABLE },
      });
    }

    const previouslyOfferedRiderIds = (
      await tx.deliveryAssignmentHistory.findMany({
        where: { deliveryId, riderId: { not: null } },
        select: { riderId: true },
        distinct: ['riderId'],
      })
    ).map((h) => h.riderId!);

    const snapshot = delivery.pickupAddressSnapshot as unknown as { latitude: number; longitude: number };
    return this.dispatch.dispatch(tx, deliveryId, snapshot.latitude, snapshot.longitude, previouslyOfferedRiderIds);
  }
}
