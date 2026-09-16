import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PromotionStatus, PromotionTargetType, PromotionType } from '@prisma/client';
import { PromotionsService } from './promotions.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('PromotionsService', () => {
  let service: PromotionsService;
  let prisma: any;

  const baseDto = {
    name: 'Test promo',
    type: PromotionType.PERCENTAGE,
    value: 20,
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-12-31T00:00:00.000Z',
    targets: [{ targetType: PromotionTargetType.BUSINESS }],
  };

  beforeEach(() => {
    prisma = {
      promotion: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      product: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      service: { findUnique: jest.fn() },
      productCategory: { findUnique: jest.fn() },
      $transaction: jest.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
    };
    service = new PromotionsService(prisma as unknown as PrismaService);
  });

  describe('create — validation', () => {
    it('rejects endDate before startDate', async () => {
      await expect(
        service.create('biz-1', { ...baseDto, startDate: '2026-06-01T00:00:00.000Z', endDate: '2026-01-01T00:00:00.000Z' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a PERCENTAGE value over 100', async () => {
      await expect(service.create('biz-1', { ...baseDto, value: 150 } as any)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a PRODUCT target that does not belong to this business', async () => {
      prisma.product.findUnique.mockResolvedValue({ businessId: 'other-biz' });
      await expect(
        service.create('biz-1', { ...baseDto, targets: [{ targetType: PromotionTargetType.PRODUCT, targetId: 'p1' }] } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a SERVICE target that does not belong to this business', async () => {
      prisma.service.findUnique.mockResolvedValue({ businessId: 'other-biz' });
      await expect(
        service.create('biz-1', { ...baseDto, targets: [{ targetType: PromotionTargetType.SERVICE, targetId: 's1' }] } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates a promotion with resolved BUSINESS target defaulting targetId to the business itself', async () => {
      prisma.promotion.create.mockResolvedValue({ id: 'promo-1' });
      await service.create('biz-1', baseDto as any);
      expect(prisma.promotion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            businessId: 'biz-1',
            targets: { create: [{ targetType: PromotionTargetType.BUSINESS, targetId: 'biz-1' }] },
          }),
        }),
      );
    });
  });

  describe('ownership', () => {
    it('404s getForBusiness when the promotion belongs to a different business', async () => {
      prisma.promotion.findUnique.mockResolvedValue({ id: 'promo-1', businessId: 'other-biz' });
      await expect(service.getForBusiness('biz-1', 'promo-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('status transitions', () => {
    it('activate only succeeds from DRAFT or PAUSED', async () => {
      prisma.promotion.findUnique.mockResolvedValue({ id: 'promo-1', businessId: 'biz-1', status: PromotionStatus.ACTIVE, endDate: new Date('2099-01-01') });
      await expect(service.activate('biz-1', 'promo-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('activate rejects a promotion whose endDate has already passed', async () => {
      prisma.promotion.findUnique.mockResolvedValue({ id: 'promo-1', businessId: 'biz-1', status: PromotionStatus.DRAFT, endDate: new Date('2000-01-01') });
      await expect(service.activate('biz-1', 'promo-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('pause only succeeds from ACTIVE', async () => {
      prisma.promotion.findUnique.mockResolvedValue({ id: 'promo-1', businessId: 'biz-1', status: PromotionStatus.DRAFT });
      await expect(service.pause('biz-1', 'promo-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('cancel rejects an already-terminal promotion', async () => {
      prisma.promotion.findUnique.mockResolvedValue({ id: 'promo-1', businessId: 'biz-1', status: PromotionStatus.CANCELLED });
      await expect(service.cancel('biz-1', 'promo-1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('update — editability', () => {
    it('rejects editing a promotion that has already left DRAFT', async () => {
      prisma.promotion.findUnique.mockResolvedValue({ id: 'promo-1', businessId: 'biz-1', status: PromotionStatus.ACTIVE });
      await expect(service.update('biz-1', 'promo-1', { name: 'New name' } as any)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('listActiveForCustomer — §4.5 visibility', () => {
    it('returns nothing for an unavailable product', async () => {
      prisma.product.findUnique.mockResolvedValue({ businessId: 'biz-1', categoryId: 'cat-1', status: 'INACTIVE', deletedAt: null });
      const result = await service.listActiveForCustomer({ productId: 'p1' } as any);
      expect(result).toEqual([]);
      expect(prisma.promotion.findMany).not.toHaveBeenCalled();
    });

    it('returns nothing for an inactive service', async () => {
      prisma.service.findUnique.mockResolvedValue({ businessId: 'biz-1', active: false });
      const result = await service.listActiveForCustomer({ serviceId: 's1' } as any);
      expect(result).toEqual([]);
    });

    it('only queries ACTIVE, in-range promotions from ACTIVE businesses', async () => {
      await service.listActiveForCustomer({ businessId: 'biz-1' } as any);
      expect(prisma.promotion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: PromotionStatus.ACTIVE,
            business: expect.objectContaining({ status: 'ACTIVE' }),
          }),
        }),
      );
    });
  });
});
