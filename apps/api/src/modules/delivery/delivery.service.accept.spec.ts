import { ConflictException } from '@nestjs/common';
import { DeliveryStatus, RiderAccountStatus } from '@prisma/client';
import { DeliveryService } from './delivery.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DeliveryStateMachine } from './delivery-state-machine';

/**
 * Plan §6 / TEST 6 coverage — the other half of the concurrency fix. DeliveryService.accept() used
 * to do an unconditional `tx.delivery.update`; this proves the conditional `updateMany` guard (on
 * `status: RIDER_ASSIGNED, riderId`) means a rider whose offer was reassigned out from under them
 * a moment earlier (e.g. by OfferTimeoutSweeper) gets a clean OFFER_NO_LONGER_AVAILABLE instead of
 * silently flipping a delivery that's no longer theirs.
 */
describe('DeliveryService.accept — concurrency guard', () => {
  let service: DeliveryService;
  let prisma: any;
  let gateway: any;
  let notifications: any;
  const unused = {} as any;

  const offeredDelivery = {
    id: 'd1',
    riderId: 'rider-1',
    status: DeliveryStatus.RIDER_ASSIGNED,
    order: { userId: 'u1' },
  };

  beforeEach(() => {
    prisma = {
      delivery: { findUnique: jest.fn().mockResolvedValue(offeredDelivery) },
      rider: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'rider-1', accountStatus: RiderAccountStatus.ACTIVE }) },
      $transaction: jest.fn(),
    };
    gateway = { emitStatusUpdated: jest.fn(), emitRiderAssigned: jest.fn(), emitDeliveryOffer: jest.fn() };
    notifications = { notify: jest.fn() };
    service = new DeliveryService(
      prisma as unknown as PrismaService,
      unused, // eligibility
      new DeliveryStateMachine(),
      unused, // dispatch
      unused, // dispatchOrchestrator
      unused, // reassignment
      unused, // proof
      unused, // sync
      unused, // maps
      notifications,
      gateway,
      unused, // fareConfig
    );
  });

  it('throws OFFER_NO_LONGER_AVAILABLE without writing history/rider state when a concurrent reassignment already won the race (updateMany matches 0 rows)', async () => {
    const tx = {
      delivery: { updateMany: jest.fn().mockResolvedValue({ count: 0 }), update: jest.fn(), findUniqueOrThrow: jest.fn() },
      deliveryAssignmentHistory: { create: jest.fn() },
      rider: { update: jest.fn() },
    };
    prisma.$transaction.mockImplementation((fn: any) => fn(tx));

    const err = await service.accept('rider-1', 'd1').catch((e: any) => e);

    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ error: { code: 'OFFER_NO_LONGER_AVAILABLE' } });
    expect(tx.deliveryAssignmentHistory.create).not.toHaveBeenCalled();
    expect(tx.rider.update).not.toHaveBeenCalled();
    expect(tx.delivery.update).not.toHaveBeenCalled();
  });

  it('accepts and transitions through to GOING_TO_PICKUP when the guarded update matches — the winner of the race', async () => {
    const tx = {
      delivery: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'd1', status: DeliveryStatus.GOING_TO_PICKUP, order: { userId: 'u1' } }),
      },
      deliveryAssignmentHistory: { create: jest.fn() },
      rider: { update: jest.fn() },
    };
    prisma.$transaction.mockImplementation((fn: any) => fn(tx));

    const result = await service.accept('rider-1', 'd1');

    expect(result.status).toBe(DeliveryStatus.GOING_TO_PICKUP);
    expect(tx.delivery.updateMany).toHaveBeenCalledWith({
      where: { id: 'd1', status: DeliveryStatus.RIDER_ASSIGNED, riderId: 'rider-1' },
      data: expect.objectContaining({ status: DeliveryStatus.RIDER_ACCEPTED }),
    });
    expect(tx.deliveryAssignmentHistory.create).toHaveBeenCalled();
    expect(tx.rider.update).toHaveBeenCalled();
  });
});
