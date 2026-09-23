import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminCouponStatus, BusinessMembershipStatus, MembershipPaymentMethod, MembershipPaymentStatus } from '@prisma/client';
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
      subscription: { create: jest.fn((args: any) => ({ id: 'sub-1', ...args.data })) },
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

        await service.submitPayment('b1', 'user-1', 'https://x/receipt.png', MembershipPaymentMethod.CARD);

        const data = prisma.membershipPayment.create.mock.calls[0][0].data;
        expect(data.periodStart).toEqual(membershipWithOpenPeriod.createdAt);
        expect(data.periodEnd).toEqual(membershipWithOpenPeriod.trialEndsAt);
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
