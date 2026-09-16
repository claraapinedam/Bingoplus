import { BadRequestException } from '@nestjs/common';
import { RiderAccountStatus, RiderAvailabilityStatus } from '@prisma/client';
import { RidersService } from './riders.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('RidersService', () => {
  let service: RidersService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      rider: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      $transaction: jest.fn(),
    };
    service = new RidersService(prisma as unknown as PrismaService);
  });

  it('only approves riders that are PENDING_APPROVAL', async () => {
    prisma.rider.findUnique.mockResolvedValue({ id: 'r1', accountStatus: RiderAccountStatus.ACTIVE });
    await expect(service.approve('r1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('approves a pending rider', async () => {
    prisma.rider.findUnique.mockResolvedValue({ id: 'r1', accountStatus: RiderAccountStatus.PENDING_APPROVAL });
    prisma.rider.update.mockResolvedValue({ id: 'r1', accountStatus: RiderAccountStatus.ACTIVE });
    const result = await service.approve('r1');
    expect(prisma.rider.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { accountStatus: RiderAccountStatus.ACTIVE },
    });
    expect(result.accountStatus).toBe(RiderAccountStatus.ACTIVE);
  });

  it('only reactivates riders that are SUSPENDED', async () => {
    prisma.rider.findUnique.mockResolvedValue({ id: 'r1', accountStatus: RiderAccountStatus.ACTIVE });
    await expect(service.reactivate('r1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('suspending a rider also forces them OFFLINE — SUSPENDED+AVAILABLE must never be reachable', async () => {
    prisma.rider.findUnique.mockResolvedValue({ id: 'r1', accountStatus: RiderAccountStatus.ACTIVE });
    prisma.rider.update.mockResolvedValue({ id: 'r1', accountStatus: RiderAccountStatus.SUSPENDED });
    await service.suspend('r1');
    expect(prisma.rider.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { accountStatus: RiderAccountStatus.SUSPENDED, availabilityStatus: RiderAvailabilityStatus.OFFLINE },
    });
  });

  it('setStatus forces OFFLINE for any non-ACTIVE target status', async () => {
    prisma.rider.findUnique.mockResolvedValue({ id: 'r1', accountStatus: RiderAccountStatus.ACTIVE });
    prisma.rider.update.mockResolvedValue({ id: 'r1', accountStatus: RiderAccountStatus.REJECTED });
    await service.setStatus('r1', RiderAccountStatus.REJECTED);
    expect(prisma.rider.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { accountStatus: RiderAccountStatus.REJECTED, availabilityStatus: RiderAvailabilityStatus.OFFLINE },
    });
  });

  it('setStatus to ACTIVE does not touch availabilityStatus', async () => {
    prisma.rider.findUnique.mockResolvedValue({ id: 'r1', accountStatus: RiderAccountStatus.SUSPENDED });
    prisma.rider.update.mockResolvedValue({ id: 'r1', accountStatus: RiderAccountStatus.ACTIVE });
    await service.setStatus('r1', RiderAccountStatus.ACTIVE);
    expect(prisma.rider.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { accountStatus: RiderAccountStatus.ACTIVE },
    });
  });
});
