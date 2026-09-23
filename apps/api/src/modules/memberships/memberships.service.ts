import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AdminCouponStatus,
  BillingFrequency,
  BusinessMembershipStatus,
  MembershipPaymentStatus,
  MembershipPlanStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMembershipPlanDto, UpdateMembershipPlanDto } from './dto/membership-plan.dto';

const GOOD_STANDING: BusinessMembershipStatus[] = [BusinessMembershipStatus.TRIAL, BusinessMembershipStatus.ACTIVE];

// Same "30-day month" convention redeemAdminCoupon already uses for FREE_MONTHS — never a
// calendar-aware month, kept consistent rather than mixing two different notions of "a month".
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

/**
 * Membership → Subscription → Invoice is a financial domain kept separate from Marketplace
 * Orders (RULE 17) — a business pays BINGO+ for Directory presence here, it never goes through
 * Cart/Order. Full billing/payment processing is out of scope for this phase (no Checkout/
 * Payments yet); this service only manages the membership *state machine* and records what an
 * AdminCoupon grants as an immutable receipt.
 */
@Injectable()
export class MembershipsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Plans (Admin) ────────────────────────────────────────────────────────

  listPlans() {
    return this.prisma.membershipPlan.findMany({ orderBy: { price: 'asc' } });
  }

  async createPlan(dto: CreateMembershipPlanDto) {
    if (dto.isDefault) {
      await this.prisma.membershipPlan.updateMany({ data: { isDefault: false }, where: { isDefault: true } });
    }
    return this.prisma.membershipPlan.create({
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price,
        currency: dto.currency ?? 'USD',
        billingFrequency: dto.billingFrequency,
        trialDays: dto.trialDays ?? 0,
        benefits: dto.benefits as any,
        applicableCategories: dto.applicableCategories ?? [],
        isDefault: dto.isDefault ?? false,
        status: dto.status ?? MembershipPlanStatus.ACTIVE,
      },
    });
  }

  async updatePlan(planId: string, dto: UpdateMembershipPlanDto) {
    if (dto.isDefault) {
      await this.prisma.membershipPlan.updateMany({ data: { isDefault: false }, where: { isDefault: true } });
    }
    return this.prisma.membershipPlan.update({ where: { id: planId }, data: dto as any });
  }

  // ── Business membership lifecycle ───────────────────────────────────────

  getForBusiness(businessId: string) {
    return this.prisma.businessMembership.findUnique({
      where: { businessId },
      include: {
        plan: true,
        subscriptions: { orderBy: { createdAt: 'desc' }, take: 5 },
        payments: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
  }

  /** Whether this business's *current, in-good-standing* membership plan grants a given benefit
   * key (e.g. "coupons", "bookings", "featured") — the real, enforced half of what a plan's
   * `benefits` JSON otherwise only advertises. No membership, or a lapsed one (CANCELLED/EXPIRED/
   * PAST_DUE), never grants anything — only TRIAL/ACTIVE count as in good standing. */
  async hasBenefit(businessId: string, key: string): Promise<boolean> {
    const membership = await this.prisma.businessMembership.findUnique({
      where: { businessId },
      include: { plan: true },
    });
    if (!membership || !GOOD_STANDING.includes(membership.status)) return false;
    const benefits = membership.plan.benefits as Record<string, unknown> | null;
    return benefits?.[key] === true;
  }

  /**
   * Called once, when a business is approved (BusinessesService.approve) — RULE from docs §12:
   * a business only needs a membership once it needs Directory presence, which today is every
   * approved business (DIRECTORY_LISTING defaults on). Idempotent: a second call is a no-op.
   */
  async startTrialIfMissing(businessId: string) {
    const existing = await this.prisma.businessMembership.findUnique({ where: { businessId } });
    if (existing) return existing;

    const plan =
      (await this.prisma.membershipPlan.findFirst({
        where: { isDefault: true, status: MembershipPlanStatus.ACTIVE },
      })) ?? (await this.prisma.membershipPlan.findFirst({ where: { status: MembershipPlanStatus.ACTIVE } }));
    if (!plan) return null; // no plan configured yet — documented gap, never silently fabricated

    return this.prisma.businessMembership.create({
      data: {
        businessId,
        planId: plan.id,
        status: BusinessMembershipStatus.TRIAL,
        trialEndsAt: new Date(Date.now() + plan.trialDays * 24 * 60 * 60 * 1000),
      },
    });
  }

  async setStatus(businessId: string, status: BusinessMembershipStatus) {
    const membership = await this.prisma.businessMembership.findUnique({ where: { businessId } });
    if (!membership) throw new NotFoundException('This business has no membership yet');
    return this.prisma.businessMembership.update({
      where: { businessId },
      data: { status, cancelledAt: status === BusinessMembershipStatus.CANCELLED ? new Date() : undefined },
    });
  }

  // ── Admin coupon redemption against a membership ────────────────────────

  /**
   * Validates every rule the spec lists (§16/17) inside one transaction: coupon exists/ACTIVE,
   * within date range, under its global usage limit and per-business limit, and applicable to
   * this membership's plan. FREE_MONTHS/FREE_TRIAL_EXTENSION genuinely extend real billing dates
   * (RULE 18 — a real $0 period, never simulated); percentage/fixed discounts are recorded as an
   * immutable receipt for the next invoice to apply (no invoice-generation engine exists yet).
   */
  async redeemAdminCoupon(businessId: string, code: string) {
    return this.prisma.$transaction(async (tx) => {
      const membership = await tx.businessMembership.findUnique({ where: { businessId } });
      if (!membership) throw new BadRequestException('This business has no membership to apply a coupon to');

      const coupon = await tx.adminCoupon.findUnique({ where: { code } });
      if (!coupon) throw new NotFoundException('Coupon not found');
      if (coupon.status !== AdminCouponStatus.ACTIVE) {
        throw new BadRequestException('This coupon is not active');
      }
      const now = new Date();
      if (now < coupon.startDate || now > coupon.expirationDate) {
        throw new BadRequestException('This coupon is not within its valid date range');
      }
      if (
        coupon.applicablePlans.length > 0 &&
        !coupon.applicablePlans.includes(membership.planId)
      ) {
        throw new BadRequestException('This coupon does not apply to your current plan');
      }

      const totalRedemptions = await tx.adminCouponRedemption.count({ where: { couponId: coupon.id } });
      if (coupon.usageLimit !== null && totalRedemptions >= coupon.usageLimit) {
        throw new BadRequestException('This coupon has reached its usage limit');
      }
      const businessRedemptions = await tx.adminCouponRedemption.count({
        where: { couponId: coupon.id, membership: { businessId } },
      });
      if (coupon.usagePerBusiness !== null && businessRedemptions >= coupon.usagePerBusiness) {
        throw new BadRequestException('Your business has already used this coupon');
      }

      const appliedValue: Record<string, unknown> = { type: coupon.discountType };
      const membershipUpdate: Record<string, unknown> = {};

      if (coupon.discountType === 'FREE_MONTHS' || coupon.discountType === 'FREE_TRIAL_EXTENSION') {
        const months = coupon.discountType === 'FREE_MONTHS' ? coupon.freeMonths ?? 0 : 0;
        const extendMs = months * 30 * 24 * 60 * 60 * 1000;
        if (coupon.discountType === 'FREE_TRIAL_EXTENSION' && membership.trialEndsAt) {
          const newTrialEnd = new Date(membership.trialEndsAt.getTime() + 30 * 24 * 60 * 60 * 1000);
          membershipUpdate.trialEndsAt = newTrialEnd;
          appliedValue.newTrialEndsAt = newTrialEnd;
        } else if (membership.currentPeriodEnd) {
          const newPeriodEnd = new Date(membership.currentPeriodEnd.getTime() + extendMs);
          membershipUpdate.currentPeriodEnd = newPeriodEnd;
          appliedValue.freeMonths = months;
          appliedValue.newPeriodEnd = newPeriodEnd;
        } else {
          appliedValue.freeMonths = months;
          appliedValue.note = 'No active billing period to extend yet — recorded for the next one.';
        }
      } else {
        appliedValue.discountValue = coupon.discountValue;
      }

      if (Object.keys(membershipUpdate).length > 0) {
        await tx.businessMembership.update({ where: { businessId }, data: membershipUpdate });
      }

      return tx.adminCouponRedemption.create({
        data: {
          couponId: coupon.id,
          membershipId: membership.id,
          appliedValue: appliedValue as any,
        },
      });
    });
  }

  // ── Membership payments (manual deposit + receipt, RULE: no card-charging infra exists yet) ──

  private periodLengthMs(plan: { billingFrequency: BillingFrequency }): number {
    return plan.billingFrequency === BillingFrequency.YEARLY ? YEAR_MS : MONTH_MS;
  }

  /**
   * The period a business currently owes a payment for. No rollover engine writes
   * currentPeriodStart/End automatically yet (see the model comment on MembershipPayment) — this
   * only ever advances via MembershipPastDueSweeper's first-period initialization (trial -> its
   * first due date) and verifyPayment below (once a period is actually paid). Falls back to
   * treating the trial itself as the first "period" so a business can pay to convert out of TRIAL
   * even before the sweeper has run.
   */
  private resolveDuePeriod(membership: {
    createdAt: Date;
    trialEndsAt: Date | null;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
  }): { periodStart: Date; periodEnd: Date } {
    if (membership.currentPeriodStart && membership.currentPeriodEnd) {
      return { periodStart: membership.currentPeriodStart, periodEnd: membership.currentPeriodEnd };
    }
    if (membership.trialEndsAt) {
      return { periodStart: membership.createdAt, periodEnd: membership.trialEndsAt };
    }
    return { periodStart: membership.createdAt, periodEnd: new Date() };
  }

  /** Business uploads a deposit receipt for its current due period — creates a PENDING
   * MembershipPayment. Amount/period are always resolved from the membership/plan themselves,
   * never taken from the client. Mirrors Refund's create-then-admin-completes shape. */
  async submitPayment(businessId: string, submittedBy: string, receiptUrl: string) {
    const membership = await this.prisma.businessMembership.findUnique({
      where: { businessId },
      include: { plan: true },
    });
    if (!membership) throw new NotFoundException('This business has no membership yet');

    const alreadyPending = await this.prisma.membershipPayment.findFirst({
      where: { membershipId: membership.id, status: MembershipPaymentStatus.PENDING },
    });
    if (alreadyPending) {
      throw new BadRequestException('There is already a payment proof pending review for this membership.');
    }

    const { periodStart, periodEnd } = this.resolveDuePeriod(membership);

    return this.prisma.membershipPayment.create({
      data: {
        membershipId: membership.id,
        periodStart,
        periodEnd,
        amount: membership.plan.price,
        currency: membership.plan.currency,
        receiptUrl,
        submittedBy,
      },
    });
  }

  listPayments(status?: MembershipPaymentStatus) {
    return this.prisma.membershipPayment.findMany({
      where: status ? { status } : undefined,
      include: { membership: { include: { business: { select: { id: true, tradeName: true } }, plan: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPayment(id: string) {
    const payment = await this.prisma.membershipPayment.findUnique({
      where: { id },
      include: { membership: { include: { business: { select: { id: true, tradeName: true } }, plan: { select: { name: true } } } } },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  /**
   * Admin confirms the deposit actually happened (mirrors RefundService.completeManual exactly —
   * no payment-provider call, this only records that it happened). This is what actually settles
   * the period: it creates the real Subscription row for the period just paid (the only place in
   * this codebase that ever writes a Subscription row — see the model-shape gap documented on
   * MembershipPayment), advances BusinessMembership.currentPeriodStart/End to the next period, and
   * clears any PAST_DUE (or TRIAL) back to ACTIVE — the "unblock access" half of the 5-day rule,
   * enforced automatically everywhere MembershipsService.hasBenefit is consulted.
   */
  async verifyPayment(paymentId: string, reviewedBy: string) {
    const payment = await this.prisma.membershipPayment.findUnique({
      where: { id: paymentId },
      include: { membership: { include: { plan: true } } },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== MembershipPaymentStatus.PENDING) {
      throw new BadRequestException('This payment was already reviewed.');
    }

    const nextPeriodStart = payment.periodEnd;
    const nextPeriodEnd = new Date(nextPeriodStart.getTime() + this.periodLengthMs(payment.membership.plan));

    return this.prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.create({
        data: {
          membershipId: payment.membershipId,
          periodStart: payment.periodStart,
          periodEnd: payment.periodEnd,
          amount: payment.amount,
          currency: payment.currency,
          status: SubscriptionStatus.ACTIVE,
        },
      });

      const updated = await tx.membershipPayment.update({
        where: { id: paymentId },
        data: {
          status: MembershipPaymentStatus.VERIFIED,
          reviewedBy,
          reviewedAt: new Date(),
          subscriptionId: subscription.id,
        },
      });

      await tx.businessMembership.update({
        where: { id: payment.membershipId },
        data: {
          status: BusinessMembershipStatus.ACTIVE,
          currentPeriodStart: nextPeriodStart,
          currentPeriodEnd: nextPeriodEnd,
        },
      });

      return updated;
    });
  }

  async rejectPayment(paymentId: string, reviewedBy: string, reason?: string) {
    const payment = await this.prisma.membershipPayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== MembershipPaymentStatus.PENDING) {
      throw new BadRequestException('This payment was already reviewed.');
    }
    return this.prisma.membershipPayment.update({
      where: { id: paymentId },
      data: { status: MembershipPaymentStatus.REJECTED, reviewedBy, reviewedAt: new Date(), rejectionReason: reason },
    });
  }
}
