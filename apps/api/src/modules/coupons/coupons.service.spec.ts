import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BusinessCouponStatus } from '@prisma/client';
import { CouponsService } from './coupons.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessCapabilitiesService } from '../business-capabilities/business-capabilities.service';
import { MembershipsService } from '../memberships/memberships.service';
import {
  CouponCustomerLimitReachedException,
  CouponUsageLimitReachedException,
  CouponWrongBusinessException,
} from '../../common/exceptions/coupon.exceptions';

describe('CouponsService', () => {
  let service: CouponsService;
  let prisma: any;
  let capabilities: any;
  let memberships: any;
  let jwt: any;

  const baseCoupon = {
    id: 'c1',
    businessId: 'b1',
    status: BusinessCouponStatus.ACTIVE,
    startDate: new Date(Date.now() - 86_400_000),
    expirationDate: new Date(Date.now() + 86_400_000),
    minimumPurchase: null,
    maximumDiscount: null,
    usageLimit: null,
    usagePerCustomer: null,
    discountType: 'FIXED_AMOUNT',
    discountValue: 5,
  };

  beforeEach(() => {
    prisma = {
      businessCoupon: {
        create: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      couponRedemption: { count: jest.fn().mockResolvedValue(0), create: jest.fn((args: any) => args.data) },
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'c1' }]),
      $transaction: jest.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
    };
    capabilities = { has: jest.fn() };
    memberships = { hasBenefit: jest.fn() };
    jwt = { sign: jest.fn().mockReturnValue('signed-token'), verify: jest.fn() };
    const config = { getOrThrow: jest.fn().mockReturnValue('secret') };
    service = new CouponsService(
      prisma as unknown as PrismaService,
      capabilities as unknown as BusinessCapabilitiesService,
      memberships as unknown as MembershipsService,
      jwt as any,
      config as any,
    );
  });

  describe('RULE 14 — coupon creation requires the COUPONS capability', () => {
    it('refuses to create a coupon when the business lacks the COUPONS capability', async () => {
      capabilities.has.mockResolvedValue(false);
      await expect(
        service.create('b1', { code: 'X', discountType: 'FIXED_AMOUNT' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.businessCoupon.create).not.toHaveBeenCalled();
    });

    it('refuses to create a coupon when the business has no membership plan granting the coupons benefit', async () => {
      capabilities.has.mockResolvedValue(true);
      memberships.hasBenefit.mockResolvedValue(false);
      await expect(
        service.create('b1', {
          code: 'X',
          title: 'Promo',
          discountType: 'FIXED_AMOUNT',
          discountValue: 5,
          startDate: new Date().toISOString(),
          expirationDate: new Date().toISOString(),
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.businessCoupon.create).not.toHaveBeenCalled();
    });

    it('creates the coupon once COUPONS is enabled and the membership grants the benefit', async () => {
      capabilities.has.mockResolvedValue(true);
      memberships.hasBenefit.mockResolvedValue(true);
      prisma.businessCoupon.create.mockResolvedValue({ id: 'c1' });
      await service.create('b1', {
        code: 'X',
        title: 'Promo',
        discountType: 'FIXED_AMOUNT',
        discountValue: 5,
        startDate: new Date().toISOString(),
        expirationDate: new Date().toISOString(),
      } as any);
      expect(prisma.businessCoupon.create).toHaveBeenCalled();
      expect(memberships.hasBenefit).toHaveBeenCalledWith('b1', 'coupons');
    });
  });

  describe('RULE 15 — presential redemption re-validates everything server-side', () => {
    it('rejects an invalid or expired token before touching the database', async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('bad token');
      });
      await expect(service.redeem('b1', 'bogus', {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a coupon token scanned by a different business', async () => {
      jwt.verify.mockReturnValue({ couponId: 'c1', customerId: 'cust-1' });
      prisma.businessCoupon.findUnique.mockResolvedValue({ ...baseCoupon, businessId: 'other-business' });
      await expect(service.redeem('b1', 'tok', {})).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.redeem('b1', 'tok', {})).rejects.toBeInstanceOf(CouponWrongBusinessException);
    });

    it('locks the coupon row (FOR UPDATE) before re-checking usage — the concurrency guard against double redemption', async () => {
      jwt.verify.mockReturnValue({ couponId: 'c1', customerId: 'cust-1' });
      prisma.businessCoupon.findUnique.mockResolvedValue({ ...baseCoupon });
      await service.redeem('b1', 'tok', {});
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('rejects redemption outside the coupon date range', async () => {
      jwt.verify.mockReturnValue({ couponId: 'c1', customerId: 'cust-1' });
      prisma.businessCoupon.findUnique.mockResolvedValue({
        ...baseCoupon,
        expirationDate: new Date(Date.now() - 1000),
      });
      await expect(service.redeem('b1', 'tok', {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects redemption once the global usageLimit is reached', async () => {
      jwt.verify.mockReturnValue({ couponId: 'c1', customerId: 'cust-1' });
      prisma.businessCoupon.findUnique.mockResolvedValue({ ...baseCoupon, usageLimit: 3 });
      prisma.couponRedemption.count.mockResolvedValueOnce(3); // total redemptions
      await expect(service.redeem('b1', 'tok', {})).rejects.toBeInstanceOf(CouponUsageLimitReachedException);
    });

    it('rejects a duplicate redemption by the same customer once usagePerCustomer is hit', async () => {
      jwt.verify.mockReturnValue({ couponId: 'c1', customerId: 'cust-1' });
      prisma.businessCoupon.findUnique.mockResolvedValue({ ...baseCoupon, usagePerCustomer: 1 });
      prisma.couponRedemption.count
        .mockResolvedValueOnce(0) // total redemptions — under the (null) global limit
        .mockResolvedValueOnce(1); // this customer already redeemed once
      await expect(service.redeem('b1', 'tok', {})).rejects.toBeInstanceOf(CouponCustomerLimitReachedException);
      expect(prisma.couponRedemption.create).not.toHaveBeenCalled();
    });

    it('records a valid redemption once, capping the discount at maximumDiscount', async () => {
      jwt.verify.mockReturnValue({ couponId: 'c1', customerId: 'cust-1' });
      prisma.businessCoupon.findUnique.mockResolvedValue({
        ...baseCoupon,
        discountType: 'PERCENTAGE',
        discountValue: 50,
        maximumDiscount: 10,
      });

      const result = await service.redeem('b1', 'tok', { purchaseAmount: 100 });

      expect(result.discountAmount).toBe(10); // 50% of 100 = 50, capped at 10
      expect(prisma.couponRedemption.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('validate() — business dry run, never writes a redemption', () => {
    it('returns the same verdict redeem() would, without creating anything', async () => {
      jwt.verify.mockReturnValue({ couponId: 'c1', customerId: 'cust-1' });
      prisma.businessCoupon.findUnique.mockResolvedValue({ ...baseCoupon });

      const result = await service.validate('b1', 'tok', {});

      expect(result.valid).toBe(true);
      expect(prisma.couponRedemption.create).not.toHaveBeenCalled();
    });

    it('rejects the same way redeem() would for a coupon at its usage limit', async () => {
      jwt.verify.mockReturnValue({ couponId: 'c1', customerId: 'cust-1' });
      prisma.businessCoupon.findUnique.mockResolvedValue({ ...baseCoupon, usageLimit: 1 });
      prisma.couponRedemption.count.mockResolvedValueOnce(1);
      await expect(service.validate('b1', 'tok', {})).rejects.toBeInstanceOf(CouponUsageLimitReachedException);
    });
  });

  describe('getCouponSummary() — the three-state Directory visibility rule', () => {
    it('reports no active coupons when the COUPONS capability is off, without querying coupons at all', async () => {
      capabilities.has.mockResolvedValue(false);
      const result = await service.getCouponSummary('b1');
      expect(result).toEqual({ hasActiveCoupons: false, count: 0 });
      expect(prisma.businessCoupon.count).not.toHaveBeenCalled();
    });

    it('reports no active coupons when COUPONS is on but none are currently active', async () => {
      capabilities.has.mockResolvedValue(true);
      prisma.businessCoupon.count.mockResolvedValue(0);
      const result = await service.getCouponSummary('b1');
      expect(result).toEqual({ hasActiveCoupons: false, count: 0 });
    });

    it('reports active coupons when COUPONS is on and at least one is currently active', async () => {
      capabilities.has.mockResolvedValue(true);
      prisma.businessCoupon.count.mockResolvedValue(2);
      const result = await service.getCouponSummary('b1');
      expect(result).toEqual({ hasActiveCoupons: true, count: 2 });
    });
  });

  describe('admin — global BusinessCoupon supervision (§17), never AdminCoupon', () => {
    it('listForAdmin sees coupons across every business at once', async () => {
      prisma.businessCoupon.count.mockResolvedValue(1);
      prisma.businessCoupon.findMany.mockResolvedValue([{ ...baseCoupon, business: { id: 'b1', tradeName: 'Biz' } }]);
      const result = await service.listForAdmin({});
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('listForAdmin can narrow to one business', async () => {
      await service.listForAdmin({ businessId: 'b1' });
      expect(prisma.businessCoupon.findMany.mock.calls[0][0].where).toMatchObject({ businessId: 'b1' });
    });
  });
});
