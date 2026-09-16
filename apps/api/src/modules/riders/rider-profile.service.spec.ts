import { RoleName } from '@prisma/client';
import { RiderProfileService } from './rider-profile.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RiderLocationService } from '../delivery/rider-location.service';

describe('RiderProfileService', () => {
  let service: RiderProfileService;
  let prisma: any;
  let location: any;

  beforeEach(() => {
    prisma = {
      role: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'role-rider', name: RoleName.RIDER }) },
      userRole: { upsert: jest.fn() },
      rider: { findUnique: jest.fn(), create: jest.fn() },
      riderEarning: { findMany: jest.fn() },
    };
    location = { recordUpdate: jest.fn() };
    service = new RiderProfileService(prisma as unknown as PrismaService, location as unknown as RiderLocationService);
  });

  describe('applyAsRider', () => {
    it('attaches the RIDER role via an idempotent upsert, not a plain create', async () => {
      prisma.rider.findUnique.mockResolvedValue({ id: 'r1', userId: 'u1' });
      await service.applyAsRider('u1');
      expect(prisma.userRole.upsert).toHaveBeenCalledWith({
        where: { userId_roleId: { userId: 'u1', roleId: 'role-rider' } },
        create: { userId: 'u1', roleId: 'role-rider' },
        update: {},
      });
    });

    it('creates the Rider row at its default PENDING_APPROVAL when none exists yet', async () => {
      prisma.rider.findUnique.mockResolvedValue(null);
      prisma.rider.create.mockResolvedValue({ id: 'r1', userId: 'u1', accountStatus: 'PENDING_APPROVAL' });
      const result = await service.applyAsRider('u1');
      expect(prisma.rider.create).toHaveBeenCalledWith({ data: { userId: 'u1' }, include: expect.any(Object) });
      expect(result.accountStatus).toBe('PENDING_APPROVAL');
    });

    it('does not create a second Rider row for a user who already has one', async () => {
      prisma.rider.findUnique.mockResolvedValue({ id: 'existing-rider', userId: 'u1' });
      await service.applyAsRider('u1');
      expect(prisma.rider.create).not.toHaveBeenCalled();
    });
  });

  describe('listEarnings', () => {
    it('scopes to the caller\'s own rider row, never an arbitrary riderId', async () => {
      prisma.rider.findUnique.mockResolvedValue({ id: 'r1', userId: 'u1' });
      prisma.riderEarning.findMany.mockResolvedValue([]);
      await service.listEarnings('u1');
      expect(prisma.riderEarning.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { riderId: 'r1' } }),
      );
    });
  });
});
