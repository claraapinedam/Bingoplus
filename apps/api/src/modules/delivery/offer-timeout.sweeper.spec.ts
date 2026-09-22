import { ConflictException } from '@nestjs/common';
import { DeliveryAssignmentAction, DeliveryStatus } from '@prisma/client';
import { OfferTimeoutSweeper } from './offer-timeout.sweeper';

describe('OfferTimeoutSweeper — query/orchestration logic', () => {
  let sweeper: OfferTimeoutSweeper;
  let prisma: any;
  let dispatch: any;
  let reassignment: any;
  let gateway: any;

  beforeEach(() => {
    prisma = {
      delivery: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
      $transaction: jest.fn((fn: any) => fn({})),
    };
    dispatch = { getConfig: jest.fn().mockResolvedValue({ assignmentTimeoutSeconds: 60 }) };
    reassignment = { reassign: jest.fn() };
    gateway = { emitStatusUpdated: jest.fn(), emitRiderAssigned: jest.fn(), emitDeliveryOffer: jest.fn() };
    sweeper = new OfferTimeoutSweeper(prisma, dispatch, reassignment, gateway);
  });

  it('does nothing when there are no RIDER_ASSIGNED deliveries past the timeout window', async () => {
    await sweeper.sweep();
    expect(reassignment.reassign).not.toHaveBeenCalled();
  });

  it('queries only RIDER_ASSIGNED deliveries whose assignedAt is older than assignmentTimeoutSeconds', async () => {
    await sweeper.sweep();
    const [args] = prisma.delivery.findMany.mock.calls[0];
    expect(args.where.status).toBe(DeliveryStatus.RIDER_ASSIGNED);
    expect(args.where.assignedAt.lt).toBeInstanceOf(Date);
  });

  it('reassigns each stale delivery with TIMED_OUT and pushes realtime events when a new rider is found', async () => {
    prisma.delivery.findMany.mockResolvedValue([{ id: 'd1' }]);
    prisma.delivery.findUnique.mockResolvedValue({ id: 'd1', status: DeliveryStatus.RIDER_ASSIGNED });
    reassignment.reassign.mockResolvedValue('rider-2');

    await sweeper.sweep();

    expect(reassignment.reassign).toHaveBeenCalledWith(expect.anything(), 'd1', DeliveryAssignmentAction.TIMED_OUT, expect.any(String));
    expect(gateway.emitRiderAssigned).toHaveBeenCalledWith('d1', 'rider-2');
    expect(gateway.emitDeliveryOffer).toHaveBeenCalledWith('rider-2', 'd1');
  });

  it('keeps processing the remaining deliveries when one reassignment loses a concurrency race (OFFER_NO_LONGER_AVAILABLE)', async () => {
    prisma.delivery.findMany.mockResolvedValue([{ id: 'raced-delivery' }, { id: 'ok-delivery' }]);
    prisma.delivery.findUnique.mockResolvedValue({ id: 'ok-delivery', status: DeliveryStatus.SEARCHING_RIDER });
    reassignment.reassign
      .mockRejectedValueOnce(new ConflictException({ error: { code: 'OFFER_NO_LONGER_AVAILABLE' } }))
      .mockResolvedValueOnce(null);

    await expect(sweeper.sweep()).resolves.toBeUndefined();

    expect(reassignment.reassign).toHaveBeenCalledTimes(2);
  });
});
