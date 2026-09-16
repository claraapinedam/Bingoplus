import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminCouponStatus, BusinessMembershipStatus } from '@prisma/client';
import { MembershipsService } from './memberships.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('MembershipsService', () => {
  let service: MembershipsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      businessMembership: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      membershipPlan: { findFirst: jest.fn() },
      adminCoupon: { findUnique: jest.fn() },
      adminCouponRedemption: { count: jest.fn().mockResolvedValue(0), create: jest.fn((args: any) => args.data) },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };
    service = new MembershipsService(prisma as unknown as PrismaService);
  });

  describe('membership states', () => {
    it('startTrialIfMissing is a no-op when a membership already exists', async () => {
      const existing = { id: 'm1', businessId: 'b1', status: BusinessMembershipStatus.ACTIVE };
      prisma.businessMembership.findUnique.mockResolvedValue(existing);

      const result = await service.startTrialIfMissing('b1');

      expect(result).toBe(existing);
      expect(prisma.businessMembership.create).not.toHaveBeenCalled();
    });

    it('starts a TRIAL membership on the default plan when none exists', async () => {
      prisma.businessMembership.findUnique.mockResolvedValue(null);
      prisma.membershipPlan.findFirst.mockResolvedValueOnce({ id: 'plan-default', trialDays: 30 });
      prisma.businessMembership.create.mockImplementation((args: any) => args.data);

      const result = await service.startTrialIfMissing('b1');

      expect(result!.status).toBe(BusinessMembershipStatus.TRIAL);
      expect(result!.planId).toBe('plan-default');
    });

    it('never fabricates a membership when no plan is configured', async () => {
      prisma.businessMembership.findUnique.mockResolvedValue(null);
      prisma.membershipPlan.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      const result = await service.startTrialIfMissing('b1');

      expect(result).toBeNull();
      expect(prisma.businessMembership.create).not.toHaveBeenCalled();
    });

    it('setStatus rejects a business with no membership yet', async () => {
      prisma.businessMembership.findUnique.mockResolvedValue(null);
      await expect(service.setStatus('b1', BusinessMembershipStatus.PAUSED)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('setStatus stamps cancelledAt only when moving to CANCELLED', async () => {
      prisma.businessMembership.findUnique.mockResolvedValue({ id: 'm1', businessId: 'b1' });
      await service.setStatus('b1', BusinessMembershipStatus.CANCELLED);
      const data = prisma.businessMembership.update.mock.calls[0][0].data;
      expect(data.status).toBe(BusinessMembershipStatus.CANCELLED);
      expect(data.cancelledAt).toBeInstanceOf(Date);
    });
  });

  describe('RULE 16/17 — admin coupon validation against a membership', () => {
    const membership = {
      id: 'm1',
      businessId: 'b1',
      planId: 'plan-1',
      trialEndsAt: null,
      currentPeriodEnd: null,
    };
    const activeCoupon = {
      id: 'coupon-1',
      code: 'FREE2',
      status: AdminCouponStatus.ACTIVE,
      startDate: new Date(Date.now() - 86_400_000),
      expirationDate: new Date(Date.now() + 86_400_000),
      applicablePlans: [] as string[],
      usageLimit: null,
      usagePerBusiness: null,
      discountType: 'PERCENTAGE_DISCOUNT',
      discountValue: 10,
      freeMonths: null,
    };

    it('rejects redemption when the business has no membership at all', async () => {
      prisma.businessMembership.findUnique.mockResolvedValue(null);
      await expect(service.redeemAdminCoupon('b1', 'FREE2')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an unknown coupon code', async () => {
      prisma.businessMembership.findUnique.mockResolvedValue(membership);
      prisma.adminCoupon.findUnique.mockResolvedValue(null);
      await expect(service.redeemAdminCoupon('b1', 'NOPE')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a coupon outside its date range', async () => {
      prisma.businessMembership.findUnique.mockResolvedValue(membership);
      prisma.adminCoupon.findUnique.mockResolvedValue({
        ...activeCoupon,
        expirationDate: new Date(Date.now() - 1000),
      });
      await expect(service.redeemAdminCoupon('b1', 'FREE2')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a coupon that does not apply to the membership\'s plan', async () => {
      prisma.businessMembership.findUnique.mockResolvedValue(membership);
      prisma.adminCoupon.findUnique.mockResolvedValue({
        ...activeCoupon,
        applicablePlans: ['some-other-plan'],
      });
      await expect(service.redeemAdminCoupon('b1', 'FREE2')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects once the global usageLimit is reached', async () => {
      prisma.businessMembership.findUnique.mockResolvedValue(membership);
      prisma.adminCoupon.findUnique.mockResolvedValue({ ...activeCoupon, usageLimit: 5 });
      prisma.adminCouponRedemption.count.mockResolvedValueOnce(5);
      await expect(service.redeemAdminCoupon('b1', 'FREE2')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a duplicate redemption once usagePerBusiness is hit', async () => {
      prisma.businessMembership.findUnique.mockResolvedValue(membership);
      prisma.adminCoupon.findUnique.mockResolvedValue({ ...activeCoupon, usagePerBusiness: 1 });
      prisma.adminCouponRedemption.count
        .mockResolvedValueOnce(0) // global count
        .mockResolvedValueOnce(1); // this business already redeemed once
      await expect(service.redeemAdminCoupon('b1', 'FREE2')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.adminCouponRedemption.create).not.toHaveBeenCalled();
    });

    it('FREE_MONTHS genuinely extends currentPeriodEnd as a real billing period, not a simulation', async () => {
      prisma.businessMembership.findUnique.mockResolvedValue({
        ...membership,
        currentPeriodEnd: new Date('2026-01-01T00:00:00Z'),
      });
      prisma.adminCoupon.findUnique.mockResolvedValue({
        ...activeCoupon,
        discountType: 'FREE_MONTHS',
        freeMonths: 2,
      });

      await service.redeemAdminCoupon('b1', 'FREE2');

      const updateData = prisma.businessMembership.update.mock.calls[0][0].data;
      expect(updateData.currentPeriodEnd.toISOString()).toBe('2026-03-02T00:00:00.000Z');
      const redemptionData = prisma.adminCouponRedemption.create.mock.calls[0][0].data;
      expect(redemptionData.appliedValue.freeMonths).toBe(2);
    });
  });

  describe('hasBenefit — the real, enforced half of a plan\'s advertised benefits', () => {
    it('is false when the business has no membership at all', async () => {
      prisma.businessMembership.findUnique.mockResolvedValue(null);
      expect(await service.hasBenefit('b1', 'coupons')).toBe(false);
    });

    it('is false when the membership has lapsed (e.g. CANCELLED)', async () => {
      prisma.businessMembership.findUnique.mockResolvedValue({
        status: BusinessMembershipStatus.CANCELLED,
        plan: { benefits: { coupons: true } },
      });
      expect(await service.hasBenefit('b1', 'coupons')).toBe(false);
    });

    it('is true for a TRIAL membership whose plan grants the benefit', async () => {
      prisma.businessMembership.findUnique.mockResolvedValue({
        status: BusinessMembershipStatus.TRIAL,
        plan: { benefits: { coupons: true, bookings: false } },
      });
      expect(await service.hasBenefit('b1', 'coupons')).toBe(true);
      expect(await service.hasBenefit('b1', 'bookings')).toBe(false);
    });

    it('is false for a benefit the plan never mentions at all', async () => {
      prisma.businessMembership.findUnique.mockResolvedValue({
        status: BusinessMembershipStatus.ACTIVE,
        plan: { benefits: { coupons: true } },
      });
      expect(await service.hasBenefit('b1', 'featured')).toBe(false);
    });
  });
});
