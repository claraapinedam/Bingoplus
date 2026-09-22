import { ConflictException } from '@nestjs/common';
import { DeliveryAssignmentAction, DeliveryStatus, RiderAvailabilityStatus } from '@prisma/client';
import { DeliveryReassignmentService } from './delivery-reassignment.service';
import { DeliveryStateMachine } from './delivery-state-machine';

/**
 * Plan §6 / TEST 6 coverage: DeliveryReassignmentService.reassign() is what OfferTimeoutSweeper
 * calls concurrently with a rider's own accept() call. Before the fix, both did an unconditional
 * `tx.delivery.update` with no guard on the current state — under READ COMMITTED, two concurrent
 * transactions could both read status=RIDER_ASSIGNED and both proceed to write, corrupting
 * Rider.availabilityStatus/Delivery.status. The fix is a conditional `updateMany` guarded on
 * `status: RIDER_ASSIGNED, riderId: previousRiderId` — this suite asserts the loser of that race
 * gets a clean OFFER_NO_LONGER_AVAILABLE and never touches the rider or re-dispatches.
 */
describe('DeliveryReassignmentService.reassign — concurrency guard', () => {
  let service: DeliveryReassignmentService;
  let orchestrator: any;
  let tx: any;

  const delivery = {
    id: 'd1',
    riderId: 'rider-1',
    status: DeliveryStatus.RIDER_ASSIGNED,
    pickupAddressSnapshot: { latitude: -0.2, longitude: -78.5 },
  };

  beforeEach(() => {
    orchestrator = { dispatch: jest.fn().mockResolvedValue('rider-2') };
    tx = {
      delivery: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(delivery),
        updateMany: jest.fn(),
      },
      deliveryAssignmentHistory: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([{ riderId: 'rider-1' }]),
      },
      rider: { update: jest.fn() },
    };
    service = new DeliveryReassignmentService(new DeliveryStateMachine(), orchestrator);
  });

  it('throws OFFER_NO_LONGER_AVAILABLE and never frees the rider or re-dispatches when a concurrent process already moved the delivery (updateMany matches 0 rows)', async () => {
    tx.delivery.updateMany.mockResolvedValue({ count: 0 });

    const err = await service
      .reassign(tx, 'd1', DeliveryAssignmentAction.TIMED_OUT, 'Rider did not respond in time')
      .catch((e) => e);

    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ error: { code: 'OFFER_NO_LONGER_AVAILABLE' } });
    expect(tx.rider.update).not.toHaveBeenCalled();
    expect(tx.deliveryAssignmentHistory.create).not.toHaveBeenCalled();
    expect(orchestrator.dispatch).not.toHaveBeenCalled();
  });

  it('frees the rider, records history, and re-dispatches (excluding the freed rider) when the guarded update matches — the winner of the race', async () => {
    tx.delivery.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.reassign(tx, 'd1', DeliveryAssignmentAction.TIMED_OUT, 'Rider did not respond in time');

    expect(result).toBe('rider-2');
    expect(tx.delivery.updateMany).toHaveBeenCalledWith({
      where: { id: 'd1', status: DeliveryStatus.RIDER_ASSIGNED, riderId: 'rider-1' },
      data: { riderId: null, status: DeliveryStatus.SEARCHING_RIDER },
    });
    expect(tx.rider.update).toHaveBeenCalledWith({
      where: { id: 'rider-1' },
      data: { availabilityStatus: RiderAvailabilityStatus.AVAILABLE },
    });
    expect(orchestrator.dispatch).toHaveBeenCalledWith(tx, 'd1', -0.2, -78.5, ['rider-1']);
  });
});
