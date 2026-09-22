import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, SupportCaseStatus, SupportSubmitterType } from '@prisma/client';
import { SupportCasesService } from './support-cases.service';
import { PrismaService } from '../../prisma/prisma.service';

function p2002() {
  return new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'x' });
}

describe('SupportCasesService', () => {
  let service: SupportCasesService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      businessUser: { findUnique: jest.fn() },
      rider: { findUnique: jest.fn() },
      supportCase: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
      supportCaseResponse: { create: jest.fn() },
      $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
    };
    service = new SupportCasesService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('creates a CUSTOMER case without needing any extra context check', async () => {
      prisma.supportCase.create.mockResolvedValue({ id: 'c1', code: 'SUP-000001' });
      const result = await service.create('u1', {
        submitterType: SupportSubmitterType.CUSTOMER,
        subject: 'No puedo pagar',
        description: 'El pago falla siempre',
      });
      expect(result).toEqual({ id: 'c1', code: 'SUP-000001' });
      expect(prisma.businessUser.findUnique).not.toHaveBeenCalled();
    });

    it('rejects a BUSINESS case with no businessId', async () => {
      await expect(
        service.create('u1', { submitterType: SupportSubmitterType.BUSINESS, subject: 's', description: 'd' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a BUSINESS case when the caller is not a member of that business', async () => {
      prisma.businessUser.findUnique.mockResolvedValue(null);
      await expect(
        service.create('u1', { submitterType: SupportSubmitterType.BUSINESS, businessId: 'b1', subject: 's', description: 'd' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects a RIDER case when the caller has no Rider record', async () => {
      prisma.rider.findUnique.mockResolvedValue(null);
      await expect(
        service.create('u1', { submitterType: SupportSubmitterType.RIDER, subject: 's', description: 'd' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('retries the code on a unique-constraint collision', async () => {
      prisma.supportCase.create.mockRejectedValueOnce(p2002()).mockResolvedValueOnce({ id: 'c1', code: 'SUP-000002' });
      const result = await service.create('u1', { submitterType: SupportSubmitterType.CUSTOMER, subject: 's', description: 'd' });
      expect(result).toEqual({ id: 'c1', code: 'SUP-000002' });
      expect(prisma.supportCase.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('getMine', () => {
    it('throws NotFound for a case that belongs to someone else', async () => {
      prisma.supportCase.findUnique.mockResolvedValue({ id: 'c1', submitterUserId: 'other-user' });
      await expect(service.getMine('u1', 'c1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the case when it belongs to the caller', async () => {
      prisma.supportCase.findUnique.mockResolvedValue({ id: 'c1', submitterUserId: 'u1' });
      await expect(service.getMine('u1', 'c1')).resolves.toEqual({ id: 'c1', submitterUserId: 'u1' });
    });
  });

  describe('respond', () => {
    it('auto-advances RECEIVED -> IN_PROGRESS when an admin responds', async () => {
      prisma.supportCase.findUnique.mockResolvedValue({ id: 'c1', status: SupportCaseStatus.RECEIVED });
      prisma.supportCaseResponse.create.mockResolvedValue({ id: 'r1' });
      await service.respond('c1', 'admin-1', { message: 'Estamos revisando tu caso' });
      expect(prisma.supportCase.updateMany).toHaveBeenCalledWith({
        where: { id: 'c1', status: SupportCaseStatus.RECEIVED },
        data: { status: SupportCaseStatus.IN_PROGRESS },
      });
    });
  });

  describe('setStatus', () => {
    it('stamps closedAt when moving to CLOSED', async () => {
      prisma.supportCase.findUnique.mockResolvedValue({ id: 'c1' });
      await service.setStatus('c1', SupportCaseStatus.CLOSED);
      const data = prisma.supportCase.update.mock.calls[0][0].data;
      expect(data.status).toBe(SupportCaseStatus.CLOSED);
      expect(data.closedAt).toBeInstanceOf(Date);
    });

    it('clears closedAt when reopened to IN_PROGRESS', async () => {
      prisma.supportCase.findUnique.mockResolvedValue({ id: 'c1' });
      await service.setStatus('c1', SupportCaseStatus.IN_PROGRESS);
      expect(prisma.supportCase.update.mock.calls[0][0].data.closedAt).toBeNull();
    });
  });
});
