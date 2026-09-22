import { ConflictException, Injectable } from '@nestjs/common';
import { DeliveryAssignmentAction, DeliveryAssignmentSource, DeliveryStatus, Prisma, RiderAvailabilityStatus } from '@prisma/client';
import { DeliveryStateMachine } from './delivery-state-machine';
import { DispatchOrchestratorService } from './dispatch-orchestrator.service';

/**
 * §22/23: what happens after a rider rejects, times out, or otherwise can't take a delivery —
 * frees the rider, records why (DeliveryAssignmentHistory), and tries the next best candidate,
 * excluding everyone already offered this delivery so the same rider is never re-offered.
 */
@Injectable()
export class DeliveryReassignmentService {
  constructor(
    private readonly stateMachine: DeliveryStateMachine,
    private readonly dispatchOrchestrator: DispatchOrchestratorService,
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

    // Concurrency fix (plan §6): conditional updateMany guarded on both the expected status AND
    // the specific rider this reassignment was read for. This is what makes it safe for
    // OfferTimeoutSweeper to run concurrently with a rider's own accept() — whichever transaction
    // commits first wins the row; the other's updateMany matches zero rows and this throws a clean
    // OFFER_NO_LONGER_AVAILABLE instead of freeing a rider who actually just got accepted, or
    // reassigning a delivery out from under a rider who's already on their way.
    const { count } = await tx.delivery.updateMany({
      where: { id: deliveryId, status: DeliveryStatus.RIDER_ASSIGNED, riderId: previousRiderId },
      data: { riderId: null, status: DeliveryStatus.SEARCHING_RIDER },
    });
    if (count === 0) {
      throw new ConflictException({
        error: {
          code: 'OFFER_NO_LONGER_AVAILABLE',
          message: 'This delivery already changed state (likely accepted) before this reassignment could apply.',
        },
      });
    }

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
    return this.dispatchOrchestrator.dispatch(tx, deliveryId, snapshot.latitude, snapshot.longitude, previouslyOfferedRiderIds);
  }
}
