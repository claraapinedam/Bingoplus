import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RiderAccountStatus, RiderAvailabilityStatus, RiderDocumentStatus } from '@prisma/client';
import { RidersService } from './riders.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RiderContractsService } from '../contracts/rider-contracts.service';

describe('RidersService', () => {
  let service: RidersService;
  let prisma: any;
  let riderContracts: any;

  beforeEach(() => {
    prisma = {
      rider: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      riderDocument: { findUnique: jest.fn(), update: jest.fn() },
      $transaction: jest.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
    };
    riderContracts = { createForApprovedRider: jest.fn().mockResolvedValue(undefined) };
    service = new RidersService(prisma as unknown as PrismaService, riderContracts as unknown as RiderContractsService);
  });

  it('only approves riders that are PENDING_APPROVAL', async () => {
    prisma.rider.findUnique.mockResolvedValue({ id: 'r1', accountStatus: RiderAccountStatus.ACTIVE });
    await expect(service.approve('r1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('approves a pending rider into APPROVED (not straight to ACTIVE) and generates a contract', async () => {
    prisma.rider.findUnique.mockResolvedValue({
      id: 'r1',
      accountStatus: RiderAccountStatus.PENDING_APPROVAL,
      documents: [
        { id: 'd1', status: RiderDocumentStatus.VERIFIED },
        { id: 'd2', status: RiderDocumentStatus.VERIFIED },
        { id: 'd3', status: RiderDocumentStatus.VERIFIED },
      ],
    });
    prisma.rider.update.mockResolvedValue({ id: 'r1', accountStatus: RiderAccountStatus.APPROVED });
    const result = await service.approve('r1');
    expect(prisma.rider.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { accountStatus: RiderAccountStatus.APPROVED },
    });
    expect(riderContracts.createForApprovedRider).toHaveBeenCalledWith('r1');
    expect(result.accountStatus).toBe(RiderAccountStatus.APPROVED);
  });

  it('rejects approval when any document is still PENDING', async () => {
    prisma.rider.findUnique.mockResolvedValue({
      id: 'r1',
      accountStatus: RiderAccountStatus.PENDING_APPROVAL,
      documents: [
        { id: 'd1', status: RiderDocumentStatus.VERIFIED },
        { id: 'd2', status: RiderDocumentStatus.PENDING },
      ],
    });
    await expect(service.approve('r1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.rider.update).not.toHaveBeenCalled();
    expect(riderContracts.createForApprovedRider).not.toHaveBeenCalled();
  });

  it('rejects approval when a document was REJECTED — the rider needs to re-submit it, not slip through', async () => {
    prisma.rider.findUnique.mockResolvedValue({
      id: 'r1',
      accountStatus: RiderAccountStatus.PENDING_APPROVAL,
      documents: [{ id: 'd1', status: RiderDocumentStatus.REJECTED }],
    });
    await expect(service.approve('r1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects approval when the rider has no documents on file at all', async () => {
    prisma.rider.findUnique.mockResolvedValue({ id: 'r1', accountStatus: RiderAccountStatus.PENDING_APPROVAL, documents: [] });
    await expect(service.approve('r1')).rejects.toBeInstanceOf(BadRequestException);
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

  describe('verifyDocument / rejectDocument', () => {
    it('rejects a document id that does not belong to this rider', async () => {
      prisma.riderDocument.findUnique.mockResolvedValue({ id: 'd1', riderId: 'someone-else' });
      await expect(service.verifyDocument('r1', 'd1', 'admin1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.riderDocument.update).not.toHaveBeenCalled();
    });

    it('rejects an unknown document id', async () => {
      prisma.riderDocument.findUnique.mockResolvedValue(null);
      await expect(service.verifyDocument('r1', 'd1', 'admin1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('marks the document VERIFIED with the reviewing admin stamped on it', async () => {
      prisma.riderDocument.findUnique.mockResolvedValue({ id: 'd1', riderId: 'r1' });
      prisma.riderDocument.update.mockResolvedValue({ id: 'd1', status: 'VERIFIED' });
      await service.verifyDocument('r1', 'd1', 'admin1');
      expect(prisma.riderDocument.update).toHaveBeenCalledWith({
        where: { id: 'd1' },
        data: { status: 'VERIFIED', reviewedBy: 'admin1', reviewedAt: expect.any(Date) },
      });
    });

    it('marks the document REJECTED with the reviewing admin stamped on it', async () => {
      prisma.riderDocument.findUnique.mockResolvedValue({ id: 'd1', riderId: 'r1' });
      prisma.riderDocument.update.mockResolvedValue({ id: 'd1', status: 'REJECTED' });
      await service.rejectDocument('r1', 'd1', 'admin1');
      expect(prisma.riderDocument.update).toHaveBeenCalledWith({
        where: { id: 'd1' },
        data: { status: 'REJECTED', reviewedBy: 'admin1', reviewedAt: expect.any(Date) },
      });
    });
  });

  describe('listWithPendingDocuments', () => {
    it('returns riders that have at least one PENDING document, regardless of their own accountStatus', async () => {
      prisma.rider.count.mockResolvedValue(1);
      prisma.rider.findMany.mockResolvedValue([
        { id: 'r1', user: { firstName: 'Juan', lastName: 'Pérez' }, documents: [{ id: 'd1' }] },
      ]);

      const result = await service.listWithPendingDocuments();

      expect(prisma.rider.count).toHaveBeenCalledWith({ where: { documents: { some: { status: 'PENDING' } } } });
      expect(result.total).toBe(1);
      expect(result.riders).toHaveLength(1);
    });
  });
});
