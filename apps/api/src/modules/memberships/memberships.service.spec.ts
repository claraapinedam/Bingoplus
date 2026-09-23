import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  AdminCouponStatus,
  BusinessMembershipStatus,
  MembershipPaymentMethod,
  MembershipPaymentStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { CARD_AUTO_REVIEWER, MembershipsService } from './memberships.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentService } from '../payments/payment.service';
import { PricingConfigService } from '../pricing/pricing-config.service';

describe('MembershipsService', () => {
  let service: MembershipsService;
  let prisma: any;
  let payments: any;
  let pricingConfig: any;

  beforeEach(() => {
    prisma = {
      businessMembership: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      membershipPlan: { findFirst: jest.fn() },
      adminCoupon: { findUnique: jest.fn() },
      adminCouponRedemption: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn((args: any) => args.data),
        findMany: jest.fn().mockResolvedValue([]),
      },
      membershipPayment: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn((args: any) => ({ id: 'payment-1', ...args.data })),
        update: jest.fn((args: any) => ({ id: args.where.id, ...args.data })),
      },
      payment: {
        findFirst: jest.fn(),
      },
      subscription: { create: jest.fn((args: any) => ({ id: 'sub-1', ...args.data })) },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };
    payments = {
      createPayment: jest.fn((_tx: any, target: any, amount: any, currency: string) => ({
        id: 'card-payment-1',
        ...target,
        amount,
        currency,
        provider: 'sandbox',
        status: PaymentStatus.PENDING,
      })),
      confirmPayment: jest.fn(),
    };
    pricingConfig = {
      get: jest.fn().mockResolvedValue({ serviceFeePercent: 0, serviceFeeFixed: 0, defaultTaxPercent: 0 }),
    };
    service = new MembershipsService(
      prisma as unknown as PrismaService,
      payments as unknown as PaymentService,
      pricingConfig as unknown as PricingConfigService,
    );
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

  describe('membership payments — manual deposit + receipt, admin verification', () => {
    const membershipWithOpenPeriod = {
      id: 'm1',
      businessId: 'b1',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      trialEndsAt: new Date('2026-01-31T00:00:00Z'),
      currentPeriodStart: new Date('2026-01-31T00:00:00Z'),
      currentPeriodEnd: new Date('2026-03-02T00:00:00Z'),
      plan: { price: 25, currency: 'USD', billingFrequency: 'MONTHLY' },
    };

    describe('submitPayment', () => {
      it('throws when the business has no membership yet', async () => {
        prisma.businessMembership.findUnique.mockResolvedValue(null);
        await expect(
          service.submitPayment('b1', 'user-1', 'https://x/receipt.png', MembershipPaymentMethod.DEPOSIT),
        ).rejects.toBeInstanceOf(NotFoundException);
      });

      it('refuses a second submission while one is already PENDING review with a receipt attached', async () => {
        prisma.businessMembership.findUnique.mockResolvedValue(membershipWithOpenPeriod);
        prisma.membershipPayment.findFirst.mockResolvedValue({
          id: 'existing-pending',
          status: MembershipPaymentStatus.PENDING,
          receiptUrl: 'https://x/already-submitted.png',
        });

        await expect(
          service.submitPayment('b1', 'user-1', 'https://x/receipt.png', MembershipPaymentMethod.DEPOSIT),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.membershipPayment.create).not.toHaveBeenCalled();
        expect(prisma.membershipPayment.update).not.toHaveBeenCalled();
      });

      it('attaches the receipt/method to an existing auto-generated PENDING row (no receipt yet) instead of creating a second row', async () => {
        prisma.businessMembership.findUnique.mockResolvedValue(membershipWithOpenPeriod);
        prisma.membershipPayment.findFirst.mockResolvedValue({
          id: 'auto-generated-1',
          status: MembershipPaymentStatus.PENDING,
          receiptUrl: null,
          dueDate: new Date('2026-03-07T00:00:00Z'),
        });

        await service.submitPayment('b1', 'user-1', 'https://x/receipt.png', MembershipPaymentMethod.TRANSFER);

        expect(prisma.membershipPayment.create).not.toHaveBeenCalled();
        const updateCall = prisma.membershipPayment.update.mock.calls[0][0];
        expect(updateCall.where.id).toBe('auto-generated-1');
        expect(updateCall.data).toEqual({
          receiptUrl: 'https://x/receipt.png',
          submittedBy: 'user-1',
          method: MembershipPaymentMethod.TRANSFER,
        });
      });

      it('snapshots the current period and plan price onto a new PENDING payment, with a fresh 5-day dueDate, when paying proactively before cutoff', async () => {
        prisma.businessMembership.findUnique.mockResolvedValue(membershipWithOpenPeriod);
        prisma.membershipPayment.findFirst.mockResolvedValue(null);

        const before = Date.now();
        await service.submitPayment('b1', 'user-1', 'https://x/receipt.png', MembershipPaymentMethod.DEPOSIT);

        const data = prisma.membershipPayment.create.mock.calls[0][0].data;
        expect(data.membershipId).toBe('m1');
        expect(data.amount.toString()).toBe('25');
        expect(data.receiptUrl).toBe('https://x/receipt.png');
        expect(data.method).toBe(MembershipPaymentMethod.DEPOSIT);
        expect(data.submittedBy).toBe('user-1');
        expect(data.periodStart).toEqual(membershipWithOpenPeriod.currentPeriodStart);
        expect(data.periodEnd).toEqual(membershipWithOpenPeriod.currentPeriodEnd);
        expect(data.dueDate.getTime()).toBeGreaterThanOrEqual(before + 5 * 24 * 60 * 60 * 1000 - 1000);
      });

      it('falls back to the trial window as the first due period when no currentPeriodStart/End exist yet', async () => {
        prisma.businessMembership.findUnique.mockResolvedValue({
          ...membershipWithOpenPeriod,
          currentPeriodStart: null,
          currentPeriodEnd: null,
        });
        prisma.membershipPayment.findFirst.mockResolvedValue(null);

        await service.submitPayment('b1', 'user-1', 'https://x/receipt.png', MembershipPaymentMethod.TRANSFER);

        const data = prisma.membershipPayment.create.mock.calls[0][0].data;
        expect(data.periodStart).toEqual(membershipWithOpenPeriod.createdAt);
        expect(data.periodEnd).toEqual(membershipWithOpenPeriod.trialEndsAt);
      });

      // CARD used to be just a label on this same manual-receipt flow; it's now a real charge (see
      // createMembershipCardPayment) and must never accept a receipt upload again.
      it('rejects method CARD outright — a real card charge never goes through the manual-receipt endpoint', async () => {
        await expect(
          service.submitPayment('b1', 'user-1', 'https://x/receipt.png', MembershipPaymentMethod.CARD),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.businessMembership.findUnique).not.toHaveBeenCalled();
        expect(prisma.membershipPayment.create).not.toHaveBeenCalled();
      });

      it('refuses a manual receipt while a card charge is in progress (not yet FAILED) for the same period', async () => {
        prisma.businessMembership.findUnique.mockResolvedValue(membershipWithOpenPeriod);
        prisma.membershipPayment.findFirst.mockResolvedValue({
          id: 'card-attempt-1',
          status: MembershipPaymentStatus.PENDING,
          receiptUrl: null,
          method: MembershipPaymentMethod.CARD,
          payment: { status: PaymentStatus.PENDING },
        });

        await expect(
          service.submitPayment('b1', 'user-1', 'https://x/receipt.png', MembershipPaymentMethod.DEPOSIT),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.membershipPayment.update).not.toHaveBeenCalled();
      });

      it('allows falling back to a manual receipt once the card attempt has FAILED', async () => {
        prisma.businessMembership.findUnique.mockResolvedValue(membershipWithOpenPeriod);
        prisma.membershipPayment.findFirst.mockResolvedValue({
          id: 'card-attempt-1',
          status: MembershipPaymentStatus.PENDING,
          receiptUrl: null,
          method: MembershipPaymentMethod.CARD,
          payment: { status: PaymentStatus.FAILED },
        });

        await service.submitPayment('b1', 'user-1', 'https://x/receipt.png', MembershipPaymentMethod.DEPOSIT);

        const updateCall = prisma.membershipPayment.update.mock.calls[0][0];
        expect(updateCall.where.id).toBe('card-attempt-1');
        expect(updateCall.data.method).toBe(MembershipPaymentMethod.DEPOSIT);
      });

      it('inherits the original dueDate (never resets the clock) when resubmitting after a rejection', async () => {
        prisma.businessMembership.findUnique.mockResolvedValue(membershipWithOpenPeriod);
        const originalDueDate = new Date('2026-01-20T00:00:00Z');
        prisma.membershipPayment.findFirst.mockResolvedValue({
          id: 'rejected-1',
          status: MembershipPaymentStatus.REJECTED,
          receiptUrl: 'https://x/blurry.png',
          dueDate: originalDueDate,
        });

        await service.submitPayment('b1', 'user-1', 'https://x/clear.png', MembershipPaymentMethod.DEPOSIT);

        expect(prisma.membershipPayment.update).not.toHaveBeenCalled();
        const data = prisma.membershipPayment.create.mock.calls[0][0].data;
        expect(data.dueDate).toBe(originalDueDate);
      });

      it('applies a live percentage-discount AdminCouponRedemption to the priced amount', async () => {
        prisma.businessMembership.findUnique.mockResolvedValue(membershipWithOpenPeriod);
        prisma.membershipPayment.findFirst.mockResolvedValue(null);
        prisma.adminCouponRedemption.findMany.mockResolvedValueOnce([
          {
            coupon: { discountType: 'PERCENTAGE_DISCOUNT', discountValue: 20, expirationDate: new Date(Date.now() + 86_400_000) },
          },
        ]);

        await service.submitPayment('b1', 'user-1', 'https://x/receipt.png', MembershipPaymentMethod.DEPOSIT);

        const data = prisma.membershipPayment.create.mock.calls[0][0].data;
        expect(data.amount.toString()).toBe('20'); // 25 - 20% = 20
      });
    });

    describe('computeDueAmount — coupon-aware pricing', () => {
      it('returns the plan price unchanged when there are no live discount redemptions', async () => {
        prisma.adminCouponRedemption.findMany.mockResolvedValueOnce([]);
        const amount = await service.computeDueAmount('m1', 25);
        expect(amount.toString()).toBe('25');
      });

      it('applies a FIXED_AMOUNT_DISCOUNT redemption, floored at 0', async () => {
        prisma.adminCouponRedemption.findMany.mockResolvedValueOnce([
          { coupon: { discountType: 'FIXED_AMOUNT_DISCOUNT', discountValue: 100, expirationDate: new Date(Date.now() + 86_400_000) } },
        ]);
        const amount = await service.computeDueAmount('m1', 25);
        expect(amount.toString()).toBe('0');
      });

      it('stacks multiple live discount redemptions in redemption order, each applied to the already-reduced amount', async () => {
        prisma.adminCouponRedemption.findMany.mockResolvedValueOnce([
          { coupon: { discountType: 'PERCENTAGE_DISCOUNT', discountValue: 50, expirationDate: new Date(Date.now() + 86_400_000) } },
          { coupon: { discountType: 'FIXED_AMOUNT_DISCOUNT', discountValue: 5, expirationDate: new Date(Date.now() + 86_400_000) } },
        ]);
        // 100 -> 50% off -> 50 -> minus 5 -> 45 (NOT 100 - 50 - 5 = 45 coincidentally same here,
        // so use a value where stacking vs. "off the original price" actually differ)
        const amount = await service.computeDueAmount('m1', 100);
        expect(amount.toString()).toBe('45');
      });

      it('stacking is order-dependent (proof it is not simply summing discounts off the original price)', async () => {
        prisma.adminCouponRedemption.findMany.mockResolvedValueOnce([
          { coupon: { discountType: 'FIXED_AMOUNT_DISCOUNT', discountValue: 10, expirationDate: new Date(Date.now() + 86_400_000) } },
          { coupon: { discountType: 'PERCENTAGE_DISCOUNT', discountValue: 50, expirationDate: new Date(Date.now() + 86_400_000) } },
        ]);
        // 100 -> minus 10 -> 90 -> 50% off -> 45. "Off the original price" would give 100-10-50=40.
        const amount = await service.computeDueAmount('m1', 100);
        expect(amount.toString()).toBe('45');
      });

      it('never queries FREE_MONTHS/FREE_TRIAL_EXTENSION redemptions — only the two discount types', async () => {
        prisma.adminCouponRedemption.findMany.mockResolvedValueOnce([]);
        await service.computeDueAmount('m1', 25);
        const where = prisma.adminCouponRedemption.findMany.mock.calls[0][0].where;
        expect(where.coupon.discountType.in).toEqual(['PERCENTAGE_DISCOUNT', 'FIXED_AMOUNT_DISCOUNT']);
      });
    });

    describe('generateDuePaymentIfMissing — cutoff auto-generation', () => {
      const membershipDue = {
        id: 'm1',
        planId: 'plan-1',
        plan: { price: 25, currency: 'USD' },
        currentPeriodStart: new Date('2026-01-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-02-01T00:00:00Z'),
      };

      it('does nothing when currentPeriodStart/End are not set yet', async () => {
        const result = await service.generateDuePaymentIfMissing({ ...membershipDue, currentPeriodEnd: null });
        expect(result).toBeNull();
        expect(prisma.membershipPayment.create).not.toHaveBeenCalled();
      });

      it('does nothing when a payment row already exists for this exact period (e.g. paid proactively)', async () => {
        prisma.membershipPayment.findFirst.mockResolvedValueOnce({ id: 'already-there' });
        const result = await service.generateDuePaymentIfMissing(membershipDue);
        expect(result).toBeNull();
        expect(prisma.membershipPayment.create).not.toHaveBeenCalled();
      });

      it('creates a PENDING placeholder with no receipt/method and a dueDate 5 days out', async () => {
        prisma.membershipPayment.findFirst.mockResolvedValueOnce(null);
        prisma.adminCouponRedemption.findMany.mockResolvedValueOnce([]);

        const before = Date.now();
        await service.generateDuePaymentIfMissing(membershipDue);

        const data = prisma.membershipPayment.create.mock.calls[0][0].data;
        expect(data.membershipId).toBe('m1');
        expect(data.periodStart).toEqual(membershipDue.currentPeriodStart);
        expect(data.periodEnd).toEqual(membershipDue.currentPeriodEnd);
        expect(data.amount.toString()).toBe('25');
        expect(data.receiptUrl).toBeUndefined();
        expect(data.method).toBeUndefined();
        expect(data.dueDate.getTime()).toBeGreaterThanOrEqual(before + 5 * 24 * 60 * 60 * 1000 - 1000);
      });
    });

    describe('verifyPayment', () => {
      const pendingPayment = {
        id: 'payment-1',
        membershipId: 'm1',
        status: MembershipPaymentStatus.PENDING,
        periodStart: new Date('2026-01-31T00:00:00Z'),
        periodEnd: new Date('2026-03-02T00:00:00Z'),
        amount: 25,
        currency: 'USD',
        membership: { plan: { billingFrequency: 'MONTHLY' } },
      };

      it('throws when the payment does not exist', async () => {
        prisma.membershipPayment.findUnique.mockResolvedValue(null);
        await expect(service.verifyPayment('missing', 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
      });

      it('refuses to re-verify a payment that was already reviewed', async () => {
        prisma.membershipPayment.findUnique.mockResolvedValue({ ...pendingPayment, status: MembershipPaymentStatus.VERIFIED });
        await expect(service.verifyPayment('payment-1', 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
      });

      it('creates the settling Subscription row for the exact paid period', async () => {
        prisma.membershipPayment.findUnique.mockResolvedValue(pendingPayment);

        await service.verifyPayment('payment-1', 'admin-1');

        const subData = prisma.subscription.create.mock.calls[0][0].data;
        expect(subData.membershipId).toBe('m1');
        expect(subData.periodStart).toEqual(pendingPayment.periodStart);
        expect(subData.periodEnd).toEqual(pendingPayment.periodEnd);
        expect(subData.status).toBe('ACTIVE');
      });

      it('marks the payment VERIFIED with reviewer/timestamp and links the new subscription', async () => {
        prisma.membershipPayment.findUnique.mockResolvedValue(pendingPayment);

        await service.verifyPayment('payment-1', 'admin-1');

        const updateData = prisma.membershipPayment.update.mock.calls[0][0].data;
        expect(updateData.status).toBe(MembershipPaymentStatus.VERIFIED);
        expect(updateData.reviewedBy).toBe('admin-1');
        expect(updateData.reviewedAt).toBeInstanceOf(Date);
        expect(updateData.subscriptionId).toBe('sub-1');
      });

      it('advances the membership to ACTIVE and rolls currentPeriodStart/End to the next billing cycle (30 days for MONTHLY)', async () => {
        prisma.membershipPayment.findUnique.mockResolvedValue(pendingPayment);

        await service.verifyPayment('payment-1', 'admin-1');

        const membershipUpdate = prisma.businessMembership.update.mock.calls[0][0].data;
        expect(membershipUpdate.status).toBe(BusinessMembershipStatus.ACTIVE);
        expect(membershipUpdate.currentPeriodStart).toEqual(pendingPayment.periodEnd);
        expect(membershipUpdate.currentPeriodEnd.toISOString()).toBe('2026-04-01T00:00:00.000Z');
      });
    });

    describe('createMembershipCardPayment', () => {
      const membershipForCard = { id: 'm1', businessId: 'b1' };
      const duePayment = {
        id: 'due-1',
        membershipId: 'm1',
        status: MembershipPaymentStatus.PENDING,
        amount: new Prisma.Decimal(25),
        currency: 'USD',
        receiptUrl: null,
        payment: null as any,
      };

      it('throws when the business has no membership yet', async () => {
        prisma.businessMembership.findUnique.mockResolvedValue(null);
        await expect(service.createMembershipCardPayment('b1', 'user-1', 'idem-1')).rejects.toBeInstanceOf(
          NotFoundException,
        );
      });

      it('refuses to charge when there is no due (PENDING) MembershipPayment record — no "pay early" here', async () => {
        prisma.businessMembership.findUnique.mockResolvedValue(membershipForCard);
        prisma.membershipPayment.findFirst.mockResolvedValue(null);

        await expect(service.createMembershipCardPayment('b1', 'user-1', 'idem-1')).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(payments.createPayment).not.toHaveBeenCalled();
      });

      it('refuses to charge when the current period is already VERIFIED (settled, nothing due)', async () => {
        prisma.businessMembership.findUnique.mockResolvedValue(membershipForCard);
        prisma.membershipPayment.findFirst.mockResolvedValue({ ...duePayment, status: MembershipPaymentStatus.VERIFIED });

        await expect(service.createMembershipCardPayment('b1', 'user-1', 'idem-1')).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(payments.createPayment).not.toHaveBeenCalled();
      });

      it('refuses to charge when a manual receipt is already awaiting review for this period', async () => {
        prisma.businessMembership.findUnique.mockResolvedValue(membershipForCard);
        prisma.membershipPayment.findFirst.mockResolvedValue({ ...duePayment, receiptUrl: 'https://x/receipt.png' });

        await expect(service.createMembershipCardPayment('b1', 'user-1', 'idem-1')).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(payments.createPayment).not.toHaveBeenCalled();
      });

      it('returns the existing Payment idempotently when a card attempt already exists for this period', async () => {
        const existingPayment = { id: 'existing-card-payment', status: PaymentStatus.PENDING };
        prisma.businessMembership.findUnique.mockResolvedValue(membershipForCard);
        prisma.membershipPayment.findFirst.mockResolvedValue({ ...duePayment, payment: existingPayment });

        const result = await service.createMembershipCardPayment('b1', 'user-1', 'idem-1');

        expect(result).toBe(existingPayment);
        expect(payments.createPayment).not.toHaveBeenCalled();
      });

      it('charges the due amount plus a service-fee-only surcharge — never tax — using PricingConfiguration', async () => {
        prisma.businessMembership.findUnique.mockResolvedValue(membershipForCard);
        prisma.membershipPayment.findFirst.mockResolvedValue(duePayment);
        // 5% service fee + $1 fixed, and a non-zero tax rate that must NEVER be read into the total.
        pricingConfig.get.mockResolvedValue({ serviceFeePercent: 0.05, serviceFeeFixed: 1, defaultTaxPercent: 0.15 });

        await service.createMembershipCardPayment('b1', 'user-1', 'idem-1');

        // due 25 * 0.05 = 1.25 + 1 fixed = 2.25 service fee -> total 27.25 (no tax line at all)
        const createCall = payments.createPayment.mock.calls[0];
        const [, target, amount] = createCall;
        expect(target).toEqual({ membershipPaymentId: 'due-1' });
        expect(amount.toString()).toBe('27.25');
      });

      it('marks the due MembershipPayment method=CARD and records who initiated it before creating the Payment', async () => {
        prisma.businessMembership.findUnique.mockResolvedValue(membershipForCard);
        prisma.membershipPayment.findFirst.mockResolvedValue(duePayment);

        await service.createMembershipCardPayment('b1', 'user-1', 'idem-1');

        const updateCall = prisma.membershipPayment.update.mock.calls[0][0];
        expect(updateCall.where.id).toBe('due-1');
        expect(updateCall.data).toEqual({ method: MembershipPaymentMethod.CARD, submittedBy: 'user-1' });
      });

      it('never mutates a REJECTED row — creates a fresh one inheriting its dueDate, exactly like submitPayment', async () => {
        const membershipWithPlan = { ...membershipForCard, plan: { price: 25, currency: 'USD' } };
        const rejectedRow = {
          id: 'rejected-1',
          status: MembershipPaymentStatus.REJECTED,
          receiptUrl: 'https://x/blurry.png',
          dueDate: new Date('2026-01-20T00:00:00Z'),
          payment: null as any,
        };
        prisma.businessMembership.findUnique.mockResolvedValue(membershipWithPlan);
        prisma.membershipPayment.findFirst.mockResolvedValue(rejectedRow);
        prisma.adminCouponRedemption.findMany.mockResolvedValueOnce([]);

        await service.createMembershipCardPayment('b1', 'user-1', 'idem-1');

        expect(prisma.membershipPayment.update).not.toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: 'rejected-1' } }),
        );
        const createCall = prisma.membershipPayment.create.mock.calls[0][0].data;
        expect(createCall.dueDate).toBe(rejectedRow.dueDate);
        expect(createCall.amount.toString()).toBe('25');
        expect(payments.createPayment).toHaveBeenCalled();
      });
    });

    describe('confirmMembershipCardPayment', () => {
      const membershipForCard = { id: 'm1', businessId: 'b1', plan: { billingFrequency: 'MONTHLY' } };
      const cardMembershipPayment = {
        id: 'due-1',
        membershipId: 'm1',
        periodStart: new Date('2026-01-31T00:00:00Z'),
        periodEnd: new Date('2026-03-02T00:00:00Z'),
        amount: 25,
        currency: 'USD',
      };
      const cardPayment = { id: 'card-payment-1', status: PaymentStatus.PENDING, membershipPayment: cardMembershipPayment };

      it('throws when no card payment was ever initiated for this membership', async () => {
        prisma.businessMembership.findUnique.mockResolvedValue(membershipForCard);
        prisma.payment.findFirst.mockResolvedValue(null);
        await expect(service.confirmMembershipCardPayment('b1')).rejects.toBeInstanceOf(NotFoundException);
        expect(payments.confirmPayment).not.toHaveBeenCalled();
      });

      it('is idempotent — a repeated confirm on an already-PAID charge never re-confirms or re-settles', async () => {
        prisma.businessMembership.findUnique.mockResolvedValue(membershipForCard);
        prisma.payment.findFirst.mockResolvedValue({ ...cardPayment, status: PaymentStatus.PAID });

        const result = await service.confirmMembershipCardPayment('b1');

        expect(payments.confirmPayment).not.toHaveBeenCalled();
        expect(prisma.subscription.create).not.toHaveBeenCalled();
        expect(result.membershipPayment).toBe(cardMembershipPayment);
      });

      it('on a FAILED confirmation, leaves the membership/period completely untouched', async () => {
        prisma.businessMembership.findUnique.mockResolvedValue(membershipForCard);
        prisma.payment.findFirst.mockResolvedValue(cardPayment);
        payments.confirmPayment.mockResolvedValue({ ...cardPayment, status: PaymentStatus.FAILED });

        await service.confirmMembershipCardPayment('b1', true);

        expect(prisma.subscription.create).not.toHaveBeenCalled();
        expect(prisma.businessMembership.update).not.toHaveBeenCalled();
        expect(prisma.membershipPayment.update).not.toHaveBeenCalled();
      });

      it('on success, settles the period through the exact same path verifyPayment uses (settlePeriod): Subscription created, MembershipPayment VERIFIED with the CARD_AUTO_REVIEWER sentinel and method CARD, membership advanced to ACTIVE', async () => {
        prisma.businessMembership.findUnique.mockResolvedValue(membershipForCard);
        prisma.payment.findFirst.mockResolvedValue(cardPayment);
        payments.confirmPayment.mockResolvedValue({ ...cardPayment, status: PaymentStatus.PAID });

        await service.confirmMembershipCardPayment('b1');

        const subData = prisma.subscription.create.mock.calls[0][0].data;
        expect(subData.membershipId).toBe('m1');
        expect(subData.periodStart).toEqual(cardMembershipPayment.periodStart);
        expect(subData.periodEnd).toEqual(cardMembershipPayment.periodEnd);

        const paymentUpdate = prisma.membershipPayment.update.mock.calls[0][0].data;
        expect(paymentUpdate.status).toBe(MembershipPaymentStatus.VERIFIED);
        expect(paymentUpdate.reviewedBy).toBe(CARD_AUTO_REVIEWER);
        expect(paymentUpdate.method).toBe(MembershipPaymentMethod.CARD);
        expect(paymentUpdate.subscriptionId).toBe('sub-1');

        const membershipUpdate = prisma.businessMembership.update.mock.calls[0][0].data;
        expect(membershipUpdate.status).toBe(BusinessMembershipStatus.ACTIVE);
        expect(membershipUpdate.currentPeriodStart).toEqual(cardMembershipPayment.periodEnd);
        expect(membershipUpdate.currentPeriodEnd.toISOString()).toBe('2026-04-01T00:00:00.000Z');
      });
    });

    describe('rejectPayment', () => {
      it('throws when the payment does not exist', async () => {
        prisma.membershipPayment.findUnique.mockResolvedValue(null);
        await expect(service.rejectPayment('missing', 'admin-1', 'blurry photo')).rejects.toBeInstanceOf(
          NotFoundException,
        );
      });

      it('refuses to re-reject a payment that was already reviewed', async () => {
        prisma.membershipPayment.findUnique.mockResolvedValue({ id: 'payment-1', status: MembershipPaymentStatus.REJECTED });
        await expect(service.rejectPayment('payment-1', 'admin-1', 'reason')).rejects.toBeInstanceOf(BadRequestException);
      });

      it('marks the payment REJECTED with the reviewer and reason, and never touches the membership/subscription', async () => {
        prisma.membershipPayment.findUnique.mockResolvedValue({ id: 'payment-1', status: MembershipPaymentStatus.PENDING });

        await service.rejectPayment('payment-1', 'admin-1', 'Comprobante ilegible');

        const updateData = prisma.membershipPayment.update.mock.calls[0][0].data;
        expect(updateData.status).toBe(MembershipPaymentStatus.REJECTED);
        expect(updateData.reviewedBy).toBe('admin-1');
        expect(updateData.rejectionReason).toBe('Comprobante ilegible');
        expect(prisma.businessMembership.update).not.toHaveBeenCalled();
        expect(prisma.subscription.create).not.toHaveBeenCalled();
      });
    });
  });
});
