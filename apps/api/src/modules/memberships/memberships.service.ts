import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminCouponStatus, BusinessMembershipStatus, MembershipPlanStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMembershipPlanDto, UpdateMembershipPlanDto } from './dto/membership-plan.dto';

const GOOD_STANDING: BusinessMembershipStatus[] = [BusinessMembershipStatus.TRIAL, BusinessMembershipStatus.ACTIVE];

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
      include: { plan: true, subscriptions: { orderBy: { createdAt: 'desc' }, take: 5 } },
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
}
