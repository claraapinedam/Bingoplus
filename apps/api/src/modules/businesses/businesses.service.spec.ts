import { BadRequestException } from '@nestjs/common';
import { BusinessMembershipStatus, BusinessStatus, MembershipPlanStatus } from '@prisma/client';
import { BusinessesService } from './businesses.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('BusinessesService', () => {
  let service: BusinessesService;
  let prisma: any;
  let capabilities: any;
  let memberships: any;

  const baseApplyDto = {
    tradeName: 'T', legalName: 'T SA', taxId: '1', email: 'e@e.com', phone: '099',
    categorySlug: 'tiendas', addressLine: 'Av 1', city: 'Quito',
  };

  beforeEach(() => {
    prisma = {
      business: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      businessCategory: { findUnique: jest.fn().mockResolvedValue({ id: 'cat1', slug: 'tiendas' }) },
      membershipPlan: { findUnique: jest.fn() },
      businessMembership: { create: jest.fn() },
      role: { findUnique: jest.fn().mockResolvedValue(null) },
      userRole: { upsert: jest.fn() },
      commission: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
      order: { groupBy: jest.fn().mockResolvedValue([]) },
      platformSetting: { findUnique: jest.fn() },
      $transaction: jest.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
    };
    capabilities = { getMap: jest.fn().mockResolvedValue({}), grantOnboardingDefaults: jest.fn() };
    memberships = { startTrialIfMissing: jest.fn(), redeemAdminCoupon: jest.fn() };
    service = new BusinessesService(
      prisma as unknown as PrismaService,
      {} as any,
      capabilities,
      memberships,
      { getCouponSummary: jest.fn().mockResolvedValue({ hasActiveCoupons: false, count: 0 }) } as any,
    );
  });

  describe('apply — directory-listing membership rule', () => {
    it('a pure product-seller (no Directory) gets no membership — visible only in Tiendas', async () => {
      prisma.business.create.mockResolvedValue({ id: 'b1' });
      await service.apply('u1', { ...baseApplyDto, sellsProducts: true, directoryListing: false } as any);

      expect(capabilities.grantOnboardingDefaults).toHaveBeenCalledWith(
        'b1',
        expect.objectContaining({ sellsProducts: true, directoryListing: false }),
      );
      expect(prisma.businessMembership.create).not.toHaveBeenCalled();
    });

    it('a business that declines the directory gets no membership either', async () => {
      prisma.business.create.mockResolvedValue({ id: 'b1' });
      await service.apply('u1', { ...baseApplyDto, sellsProducts: false, directoryListing: false } as any);

      expect(capabilities.grantOnboardingDefaults).toHaveBeenCalledWith(
        'b1',
        expect.objectContaining({ sellsProducts: false, directoryListing: false }),
      );
      expect(prisma.businessMembership.create).not.toHaveBeenCalled();
    });

    it('rejects a directory-only business that wants to be listed but picked no plan', async () => {
      await expect(
        service.apply('u1', { ...baseApplyDto, sellsProducts: false, directoryListing: true } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.business.create).not.toHaveBeenCalled();
    });

    it('a business that sells products AND wants the Directory still needs a plan ("Ambos")', async () => {
      await expect(
        service.apply('u1', { ...baseApplyDto, sellsProducts: true, directoryListing: true } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.business.create).not.toHaveBeenCalled();
    });

    it('"Ambos" with a valid plan creates both SELLS_PRODUCTS and a membership', async () => {
      prisma.membershipPlan.findUnique.mockResolvedValue({ id: 'p1', status: MembershipPlanStatus.ACTIVE, trialDays: 14 });
      prisma.business.create.mockResolvedValue({ id: 'b1' });

      await service.apply('u1', {
        ...baseApplyDto,
        sellsProducts: true,
        directoryListing: true,
        membershipPlanId: 'p1',
      } as any);

      expect(capabilities.grantOnboardingDefaults).toHaveBeenCalledWith(
        'b1',
        expect.objectContaining({ sellsProducts: true, directoryListing: true }),
      );
      expect(prisma.businessMembership.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ businessId: 'b1', planId: 'p1' }) }),
      );
    });

    it('rejects an unknown or inactive membership plan before creating anything', async () => {
      prisma.membershipPlan.findUnique.mockResolvedValue({ id: 'p1', status: MembershipPlanStatus.INACTIVE, trialDays: 14 });
      await expect(
        service.apply('u1', { ...baseApplyDto, sellsProducts: false, directoryListing: true, membershipPlanId: 'p1' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.business.create).not.toHaveBeenCalled();
    });

    it('creates a TRIAL membership on the chosen plan for a directory-only business', async () => {
      prisma.membershipPlan.findUnique.mockResolvedValue({ id: 'p1', status: MembershipPlanStatus.ACTIVE, trialDays: 14 });
      prisma.business.create.mockResolvedValue({ id: 'b1' });

      await service.apply('u1', { ...baseApplyDto, sellsProducts: false, directoryListing: true, membershipPlanId: 'p1' } as any);

      expect(prisma.businessMembership.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ businessId: 'b1', planId: 'p1', status: BusinessMembershipStatus.TRIAL }) }),
      );
      expect(memberships.redeemAdminCoupon).not.toHaveBeenCalled();
    });

    it('an invalid coupon code does not fail the whole application — it comes back as couponError', async () => {
      prisma.membershipPlan.findUnique.mockResolvedValue({ id: 'p1', status: MembershipPlanStatus.ACTIVE, trialDays: 14 });
      prisma.business.create.mockResolvedValue({ id: 'b1' });
      memberships.redeemAdminCoupon.mockRejectedValue(new BadRequestException('This coupon is not active'));

      const result = await service.apply('u1', {
        ...baseApplyDto,
        sellsProducts: false,
        directoryListing: true,
        membershipPlanId: 'p1',
        couponCode: 'BADCODE',
      } as any);

      expect(result.couponError).toBe('This coupon is not active');
      expect(result.id).toBe('b1');
    });

    it('applies a valid coupon with no error surfaced', async () => {
      prisma.membershipPlan.findUnique.mockResolvedValue({ id: 'p1', status: MembershipPlanStatus.ACTIVE, trialDays: 14 });
      prisma.business.create.mockResolvedValue({ id: 'b1' });
      memberships.redeemAdminCoupon.mockResolvedValue({ id: 'redemption1' });

      const result = await service.apply('u1', {
        ...baseApplyDto,
        sellsProducts: false,
        directoryListing: true,
        membershipPlanId: 'p1',
        couponCode: 'GOOD10',
      } as any);

      expect(memberships.redeemAdminCoupon).toHaveBeenCalledWith('b1', 'GOOD10');
      expect(result.couponError).toBeUndefined();
    });
  });

  it('refuses to approve a business that is already ACTIVE', async () => {
    prisma.business.findUnique.mockResolvedValue({ id: 'b1', status: BusinessStatus.ACTIVE });

    await expect(service.approve('b1', 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('applies the default commission rate when none is provided', async () => {
    prisma.business.findUnique.mockResolvedValue({ id: 'b1', status: BusinessStatus.PENDING });
    prisma.platformSetting.findUnique.mockResolvedValue({ value: 0.2 });
    prisma.business.update.mockResolvedValue({ id: 'b1', status: BusinessStatus.APPROVED });

    await service.approve('b1', 'admin-1');

    expect(prisma.commission.create).toHaveBeenCalledWith({
      data: { businessId: 'b1', rate: 0.2, createdBy: 'admin-1' },
    });
  });

  it('a business only becomes sellable once activated, never on approve alone', async () => {
    prisma.business.update.mockResolvedValue({ id: 'b1', status: BusinessStatus.ACTIVE });
    const result = await service.activate('b1');
    expect(prisma.business.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { status: BusinessStatus.ACTIVE },
    });
    expect(result.status).toBe(BusinessStatus.ACTIVE);
  });

  describe('approve — membership only for Directory-listed businesses', () => {
    it('does not start a membership when the business never opted into the Directory', async () => {
      prisma.business.findUnique.mockResolvedValue({ id: 'b1', status: BusinessStatus.PENDING });
      capabilities.getMap.mockResolvedValue({ DIRECTORY_LISTING: false, SELLS_PRODUCTS: true });
      prisma.platformSetting.findUnique.mockResolvedValue({ value: 0.2 });
      prisma.business.update.mockResolvedValue({ id: 'b1', status: BusinessStatus.APPROVED });

      await service.approve('b1', 'admin-1');

      expect(memberships.startTrialIfMissing).not.toHaveBeenCalled();
    });

    it('starts a membership when the business is Directory-listed', async () => {
      prisma.business.findUnique.mockResolvedValue({ id: 'b1', status: BusinessStatus.PENDING });
      capabilities.getMap.mockResolvedValue({ DIRECTORY_LISTING: true, SELLS_PRODUCTS: false });
      prisma.platformSetting.findUnique.mockResolvedValue({ value: 0.2 });
      prisma.business.update.mockResolvedValue({ id: 'b1', status: BusinessStatus.APPROVED });

      await service.approve('b1', 'admin-1');

      expect(memberships.startTrialIfMissing).toHaveBeenCalledWith('b1');
    });
  });

  describe('listCommissionsForAdmin (§26) — real GMV × current rate, never a fabricated figure', () => {
    it('computes estimated revenue from the real sales total and the latest commission rate', async () => {
      prisma.business.findMany.mockResolvedValue([{ id: 'b1', tradeName: 'Biz', status: BusinessStatus.ACTIVE }]);
      prisma.order.groupBy.mockResolvedValue([{ businessId: 'b1', _count: { _all: 3 }, _sum: { total: 100 } }]);
      prisma.commission.findMany.mockResolvedValue([{ businessId: 'b1', rate: 0.15, effectiveFrom: new Date() }]);

      const [result] = await service.listCommissionsForAdmin();

      expect(result.gmv).toBe(100);
      expect(result.commissionRate).toBe(0.15);
      expect(result.estimatedRevenue).toBe(15);
    });

    it('a business with no Commission row yet gets a null rate/revenue, never a guessed default', async () => {
      prisma.business.findMany.mockResolvedValue([{ id: 'b1', tradeName: 'Biz', status: BusinessStatus.PENDING }]);
      prisma.commission.findMany.mockResolvedValue([]);

      const [result] = await service.listCommissionsForAdmin();

      expect(result.commissionRate).toBeNull();
      expect(result.estimatedRevenue).toBeNull();
    });
  });

  it('listCommissionHistory returns every rate change for a business, newest first', async () => {
    await service.listCommissionHistory('b1');
    expect(prisma.commission.findMany).toHaveBeenCalledWith({
      where: { businessId: 'b1' },
      orderBy: { effectiveFrom: 'desc' },
    });
  });

  describe('getCommissionSummary — same real GMV × current-rate math, scoped to one business', () => {
    it('computes estimated revenue for a single business without pulling the whole platform list', async () => {
      prisma.business.findUnique.mockResolvedValue({ id: 'b1', tradeName: 'Biz', status: BusinessStatus.ACTIVE });
      prisma.order.groupBy.mockResolvedValue([{ businessId: 'b1', _count: { _all: 2 }, _sum: { total: 50 } }]);
      prisma.commission.findFirst.mockResolvedValue({ businessId: 'b1', rate: 0.15, effectiveFrom: new Date() });

      const result = await service.getCommissionSummary('b1');

      expect(result.gmv).toBe(50);
      expect(result.commissionRate).toBe(0.15);
      expect(result.estimatedRevenue).toBe(7.5);
    });

    it('a business with no Commission row yet gets a null rate/revenue, never a guessed default', async () => {
      prisma.business.findUnique.mockResolvedValue({ id: 'b1', tradeName: 'Biz', status: BusinessStatus.PENDING });
      prisma.commission.findFirst.mockResolvedValue(null);

      const result = await service.getCommissionSummary('b1');

      expect(result.commissionRate).toBeNull();
      expect(result.estimatedRevenue).toBeNull();
    });
  });
});
