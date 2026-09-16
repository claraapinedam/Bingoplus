import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DeliveryProofService } from './delivery-proof.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('DeliveryProofService', () => {
  let service: DeliveryProofService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      deliveryProof: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
    };
    service = new DeliveryProofService(prisma as unknown as PrismaService);
  });

  it('throws NotFoundException when no proof exists for the delivery', async () => {
    prisma.deliveryProof.findUnique.mockResolvedValue(null);
    await expect(service.verify('d1', '123456')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('is idempotent — verifying an already-verified proof is a silent no-op', async () => {
    prisma.deliveryProof.findUnique.mockResolvedValue({ code: '123456', attempts: 0, verifiedAt: new Date() });
    await service.verify('d1', 'anything');
    expect(prisma.deliveryProof.update).not.toHaveBeenCalled();
  });

  it('locks out after MAX_VERIFY_ATTEMPTS wrong guesses', async () => {
    prisma.deliveryProof.findUnique.mockResolvedValue({ code: '123456', attempts: 5, verifiedAt: null, expiresAt: null });
    await expect(service.verify('d1', '000000')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an expired code', async () => {
    prisma.deliveryProof.findUnique.mockResolvedValue({
      code: '123456',
      attempts: 0,
      verifiedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(service.verify('d1', '123456')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('increments attempts and throws on a wrong code', async () => {
    prisma.deliveryProof.findUnique.mockResolvedValue({
      code: '123456',
      attempts: 1,
      verifiedAt: null,
      expiresAt: new Date(Date.now() + 60000),
    });
    await expect(service.verify('d1', '999999')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.deliveryProof.update).toHaveBeenCalledWith({
      where: { deliveryId: 'd1' },
      data: { attempts: { increment: 1 } },
    });
  });

  it('marks verifiedAt on a correct code', async () => {
    prisma.deliveryProof.findUnique.mockResolvedValue({
      code: '123456',
      attempts: 0,
      verifiedAt: null,
      expiresAt: new Date(Date.now() + 60000),
    });
    await service.verify('d1', '123456');
    expect(prisma.deliveryProof.update).toHaveBeenCalledWith({
      where: { deliveryId: 'd1' },
      data: { verifiedAt: expect.any(Date) },
    });
  });

  it('getCodeForCustomer hides the code once already verified', async () => {
    prisma.deliveryProof.findUnique.mockResolvedValue({ code: '123456', verifiedAt: new Date(), expiresAt: null });
    const result = await service.getCodeForCustomer('d1');
    expect(result).toEqual({ code: null, expiresAt: null });
  });
});
