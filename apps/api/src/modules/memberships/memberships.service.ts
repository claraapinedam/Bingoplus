import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AdminCouponStatus,
  AdminCouponType,
  BillingFrequency,
  BusinessMembershipStatus,
  MembershipPaymentMethod,
  MembershipPaymentStatus,
  MembershipPlanStatus,
  PaymentStatus,
  Prisma,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentService } from '../payments/payment.service';
import { PricingConfigService, computeServiceFeeAmount } from '../pricing/pricing-config.service';
import { CreateMembershipPlanDto, UpdateMembershipPlanDto } from './dto/membership-plan.dto';
import { isMembershipStatusGoodStanding } from './membership-visibility.util';

// Same "30-day month" convention redeemAdminCoupon already uses for FREE_MONTHS — never a
// calendar-aware month, kept consistent rather than mixing two different notions of "a month".
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

/** The single "how many days late is too late" window: how far past cutoff a MembershipPayment's
 * dueDate is set (both at auto-generation and at a proactive early submission), and — via that
 * same dueDate field — the deadline MembershipPastDueSweeper checks before flagging PAST_DUE.
 * Exported so the sweeper never hardcodes a second "5 days" constant of its own. */
export const MEMBERSHIP_PAYMENT_GRACE_DAYS = 5;
export const MEMBERSHIP_PAYMENT_GRACE_MS = MEMBERSHIP_PAYMENT_GRACE_DAYS * DAY_MS;

/** `MembershipPayment.reviewedBy` sentinel for a period settled by a successful card charge —
 * distinguishes "an admin actually looked at this" (a real admin user id, set by verifyPayment)
 * from "the business paid by card and the platform settled it automatically" in admin history. */
export const CARD_AUTO_REVIEWER = 'system:card-payment';

/**
 * Membership → Subscription → Invoice is a financial domain kept separate from Marketplace
 * Orders (RULE 17) — a business pays BINGO+ for Directory presence here, it never goes through
 * Cart/Order. Full billing/payment processing is out of scope for this phase (no Checkout/
 * Payments yet); this service only manages the membership *state machine* and records what an
 * AdminCoupon grants as an immutable receipt.
 */
@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentService,
    private readonly pricingConfig: PricingConfigService,
  ) {}

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
        // `payment` (singular) is the CARD row's own real Payment, if any — lets the business app
        // show "your card charge is processing/failed" without a second round-trip (see
        // createMembershipCardPayment/confirmMembershipCardPayment).
        payments: { orderBy: { createdAt: 'desc' }, take: 10, include: { payment: true } },
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
    if (!membership || !isMembershipStatusGoodStanding(membership.status)) return false;
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

  // ── Membership payments — DEPOSIT/TRANSFER stay manual (receipt upload + admin verification);
  // CARD is a real charge through the same PaymentService/Sandbox provider CheckoutService and
  // BookingsService already use (see createMembershipCardPayment/confirmMembershipCardPayment
  // below, and settlePeriod for the one place both paths converge). ──────────────────────────

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

  /**
   * plan.price, reduced by any still-valid PERCENTAGE_DISCOUNT/FIXED_AMOUNT_DISCOUNT
   * AdminCouponRedemption against this membership (a redemption whose parent AdminCoupon's
   * expirationDate hasn't passed). FREE_MONTHS/FREE_TRIAL_EXTENSION never reach this method at
   * all: they work by directly extending currentPeriodEnd/trialEndsAt (see redeemAdminCoupon), so
   * a period they cover is simply never due yet — no payment gets generated/priced for it in the
   * first place.
   *
   * Combination rule (no existing precedent for this — discounts were never actually applied to an
   * amount before now): multiple live discount redemptions STACK, oldest-redeemed first, each one
   * applied to the amount as already reduced by the ones before it, floored at 0 after every step.
   * Chosen over "most-recent-wins" because redeemAdminCoupon's usageLimit/usagePerBusiness rules
   * never assume only one discount redemption can be alive on a membership at once — if an admin
   * deliberately grants a business two, both should count, not silently overwrite one another.
   * Chosen over "best-for-business" (apply only the single most generous one) because that would
   * quietly waste whichever coupon was smaller with no record of why, which cuts against
   * AdminCouponRedemption.appliedValue being an immutable receipt of what was actually granted.
   */
  async computeDueAmount(membershipId: string, planPrice: Prisma.Decimal | number): Promise<Prisma.Decimal> {
    const redemptions = await this.prisma.adminCouponRedemption.findMany({
      where: {
        membershipId,
        coupon: {
          discountType: { in: [AdminCouponType.PERCENTAGE_DISCOUNT, AdminCouponType.FIXED_AMOUNT_DISCOUNT] },
          expirationDate: { gte: new Date() },
        },
      },
      orderBy: { redeemedAt: 'asc' },
      include: { coupon: true },
    });

    let amount = new Prisma.Decimal(planPrice);
    for (const redemption of redemptions) {
      const value = redemption.coupon.discountValue ?? new Prisma.Decimal(0);
      amount =
        redemption.coupon.discountType === AdminCouponType.PERCENTAGE_DISCOUNT
          ? amount.minus(amount.times(value).dividedBy(100))
          : amount.minus(value);
      if (amount.lessThan(0)) amount = new Prisma.Decimal(0);
    }
    return amount;
  }

  /**
   * Auto-generates the PENDING placeholder MembershipPayment for a membership's current due
   * period the moment cutoff (currentPeriodEnd) is reached — called by MembershipPastDueSweeper,
   * never by a controller. No receipt/method yet (nobody has paid), but dueDate is set immediately
   * so it's the one authoritative deadline from the moment the row exists. A no-op (returns null)
   * if a row for this exact period already exists — e.g. the business paid proactively before
   * cutoff via submitPayment, which also always sets dueDate.
   */
  async generateDuePaymentIfMissing(membership: {
    id: string;
    planId: string;
    plan: { price: Prisma.Decimal | number; currency: string };
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
  }) {
    if (!membership.currentPeriodStart || !membership.currentPeriodEnd) return null;

    const existing = await this.prisma.membershipPayment.findFirst({
      where: {
        membershipId: membership.id,
        periodStart: membership.currentPeriodStart,
        periodEnd: membership.currentPeriodEnd,
      },
    });
    if (existing) return null;

    const amount = await this.computeDueAmount(membership.id, membership.plan.price);
    return this.prisma.membershipPayment.create({
      data: {
        membershipId: membership.id,
        periodStart: membership.currentPeriodStart,
        periodEnd: membership.currentPeriodEnd,
        amount,
        currency: membership.plan.currency,
        dueDate: new Date(Date.now() + MEMBERSHIP_PAYMENT_GRACE_MS),
      },
    });
  }

  /**
   * Business uploads proof of payment for its current due period. Reuses the sweeper's
   * auto-generated PENDING/no-receipt row for the current period when one already exists (attaches
   * receiptUrl/method/submittedBy to it, leaving its dueDate untouched — that deadline is
   * canonical, resubmitting never resets the clock) rather than creating a second row for the same
   * period. Still supports paying proactively before cutoff ever fires: if nothing exists yet for
   * the current period, one is created here, with a fresh dueDate (there was no cutoff-driven
   * deadline yet). If the most recent row for this period is REJECTED, a new row is created to
   * preserve the rejection's audit trail, but it inherits that row's original dueDate rather than
   * getting a fresh 5 days — a rejection never resets the deadline. Mirrors Refund's
   * create-then-admin-completes shape.
   */
  async submitPayment(
    businessId: string,
    submittedBy: string,
    receiptUrl: string,
    method: MembershipPaymentMethod,
  ) {
    // CARD is a real charge now (see createMembershipCardPayment) — it never accepts a manual
    // receipt upload, which is the whole point of the owner's complaint this flow used to paper
    // over ("selecting tarjeta just asked for a proof-of-payment image").
    if (method === MembershipPaymentMethod.CARD) {
      throw new BadRequestException(
        'El pago con tarjeta se procesa directamente — usa POST .../membership/payments/card en vez de subir un comprobante.',
      );
    }

    const membership = await this.prisma.businessMembership.findUnique({
      where: { businessId },
      include: { plan: true },
    });
    if (!membership) throw new NotFoundException('This business has no membership yet');

    const { periodStart, periodEnd } = this.resolveDuePeriod(membership);

    const existingForPeriod = await this.prisma.membershipPayment.findFirst({
      where: { membershipId: membership.id, periodStart, periodEnd },
      orderBy: { createdAt: 'desc' },
      include: { payment: true },
    });

    if (existingForPeriod?.status === MembershipPaymentStatus.PENDING) {
      if (existingForPeriod.receiptUrl) {
        throw new BadRequestException('There is already a payment proof pending review for this membership.');
      }
      // A card charge was started (and hasn't failed) for this exact period — let it resolve
      // (succeed/fail) before allowing a fallback manual receipt, so the two flows never race on
      // the same MembershipPayment row.
      if (existingForPeriod.method === MembershipPaymentMethod.CARD && existingForPeriod.payment?.status !== PaymentStatus.FAILED) {
        throw new BadRequestException(
          'Ya iniciaste un pago con tarjeta para este período. Espera a que se complete o falle antes de subir un comprobante.',
        );
      }
      return this.prisma.membershipPayment.update({
        where: { id: existingForPeriod.id },
        data: { receiptUrl, submittedBy, method },
      });
    }

    const amount = await this.computeDueAmount(membership.id, membership.plan.price);
    const dueDate =
      existingForPeriod?.status === MembershipPaymentStatus.REJECTED && existingForPeriod.dueDate
        ? existingForPeriod.dueDate
        : new Date(Date.now() + MEMBERSHIP_PAYMENT_GRACE_MS);

    return this.prisma.membershipPayment.create({
      data: {
        membershipId: membership.id,
        periodStart,
        periodEnd,
        amount,
        currency: membership.plan.currency,
        receiptUrl,
        submittedBy,
        method,
        dueDate,
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
   * The one place a period actually gets settled — shared by verifyPayment (admin manually
   * verifies a deposit/transfer receipt) and confirmMembershipCardPayment (a card charge succeeds)
   * so neither duplicates: creates the real Subscription row for the period just paid (the only
   * place in this codebase that ever writes a Subscription row — see the model-shape gap
   * documented on MembershipPayment), advances BusinessMembership.currentPeriodStart/End to the
   * next period, and clears any PAST_DUE (or TRIAL) back to ACTIVE — the "unblock access" half of
   * the 5-day rule, enforced automatically everywhere MembershipsService.hasBenefit is consulted.
   * Caller already owns the transaction and already checked payment.status === PENDING.
   */
  private async settlePeriod(
    tx: Prisma.TransactionClient,
    payment: { id: string; membershipId: string; periodStart: Date; periodEnd: Date; amount: Prisma.Decimal; currency: string },
    plan: { billingFrequency: BillingFrequency },
    reviewedBy: string,
    method?: MembershipPaymentMethod,
  ) {
    const nextPeriodStart = payment.periodEnd;
    const nextPeriodEnd = new Date(nextPeriodStart.getTime() + this.periodLengthMs(plan));

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
      where: { id: payment.id },
      data: {
        status: MembershipPaymentStatus.VERIFIED,
        reviewedBy,
        reviewedAt: new Date(),
        subscriptionId: subscription.id,
        ...(method ? { method } : {}),
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
  }

  /**
   * Admin confirms the deposit actually happened (mirrors RefundService.completeManual exactly —
   * no payment-provider call, this only records that it happened) and settles the period via
   * settlePeriod.
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

    return this.prisma.$transaction((tx) => this.settlePeriod(tx, payment, payment.membership.plan, reviewedBy));
  }

  // ── Membership card payment (real charge — see PaymentService/Sandbox provider) ────────────

  /** subtotal × PricingConfiguration.serviceFeePercent + serviceFeeFixed — via the shared
   * computeServiceFeeAmount helper (same formula PriceCalculationService.calculate and
   * BookingsService.create use for their own service fees). Deliberately never touches
   * defaultTaxPercent: a membership card charge is BINGO+ billing the business directly, not a
   * taxable customer sale, so no tax line applies here — only the service fee. */
  private async computeServiceFee(dueAmount: Prisma.Decimal): Promise<Prisma.Decimal> {
    const config = await this.pricingConfig.get();
    return computeServiceFeeAmount(dueAmount, config);
  }

  /**
   * Business chooses "pagar con tarjeta" for its current due membership period. Resolves the due
   * row the exact same way submitPayment does (resolveDuePeriod, most recent row for that exact
   * period) so the manual and card flows never disagree about which row — or which period — is
   * "the" due one, and REJECTED is handled identically to submitPayment: never mutate a rejected
   * row (preserves its audit trail), create a fresh PENDING one inheriting its dueDate. Charges
   * the due amount plus a service-fee-only surcharge (never tax — see computeServiceFee).
   * Deliberately never fabricates a row when nothing is due yet (VERIFIED, or no row at all) —
   * there is no "pay early" behavior here (unlike the legacy submitPayment path), matching the
   * owner's explicit "the pagar UI belongs inside the generated record" correction. Mirrors
   * BookingsService.createBookingPayment's idempotent-retry shape via Payment.membershipPaymentId's
   * unique constraint.
   */
  async createMembershipCardPayment(businessId: string, submittedBy: string, idempotencyKey: string) {
    const membership = await this.prisma.businessMembership.findUnique({
      where: { businessId },
      include: { plan: true },
    });
    if (!membership) throw new NotFoundException('This business has no membership yet');

    const { periodStart, periodEnd } = this.resolveDuePeriod(membership);
    const existingForPeriod = await this.prisma.membershipPayment.findFirst({
      where: { membershipId: membership.id, periodStart, periodEnd },
      orderBy: { createdAt: 'desc' },
      include: { payment: true },
    });

    if (!existingForPeriod || existingForPeriod.status === MembershipPaymentStatus.VERIFIED) {
      throw new BadRequestException('No hay ningún pago de membresía pendiente para tu negocio en este momento.');
    }

    let target = existingForPeriod;
    if (target.status === MembershipPaymentStatus.PENDING) {
      if (target.payment) {
        // Same card attempt retried (e.g. a resumed page) — return what's there instead of
        // hitting Payment.membershipPaymentId's unique constraint with a second row.
        return target.payment;
      }
      if (target.receiptUrl) {
        throw new BadRequestException(
          'Ya hay un comprobante manual en revisión para este período — no se puede pagar también con tarjeta.',
        );
      }
    } else {
      // REJECTED — a fresh due amount (coupons may have changed since the rejection), a fresh
      // row, but the original dueDate: exactly submitPayment's own REJECTED-resubmission rule.
      const amount = await this.computeDueAmount(membership.id, membership.plan.price);
      target = await this.prisma.membershipPayment.create({
        data: {
          membershipId: membership.id,
          periodStart,
          periodEnd,
          amount,
          currency: membership.plan.currency,
          dueDate: target.dueDate,
        },
        include: { payment: true },
      });
    }

    const serviceFee = await this.computeServiceFee(target.amount);
    const total = target.amount.plus(serviceFee);
    const targetId = target.id;

    return this.prisma.$transaction(async (tx) => {
      await tx.membershipPayment.update({
        where: { id: targetId },
        data: { method: MembershipPaymentMethod.CARD, submittedBy },
      });
      return this.payments.createPayment(tx, { membershipPaymentId: targetId }, total, target.currency, idempotencyKey);
    });
  }

  /**
   * Confirms the Sandbox charge for the business's in-progress card payment and, on success,
   * settles the period through the exact same settlePeriod() a manually-verified receipt uses —
   * see the class comment on settlePeriod. A failed charge deliberately leaves the
   * MembershipPayment exactly as it was (still PENDING, method CARD) so the business can retry —
   * mirrors BookingsService.confirmBookingPayment's "no auto side effects on failure" rule.
   */
  async confirmMembershipCardPayment(businessId: string, simulateFailure?: boolean) {
    const membership = await this.prisma.businessMembership.findUnique({
      where: { businessId },
      include: { plan: true },
    });
    if (!membership) throw new NotFoundException('This business has no membership yet');

    // Found via the Payment row itself (not filtered to a still-PENDING MembershipPayment) so a
    // repeated/late confirm click on an already-settled charge is idempotent instead of 404ing —
    // same shape as BookingsService.confirmBookingPayment's early PAID return.
    const payment = await this.prisma.payment.findFirst({
      where: { membershipPayment: { membershipId: membership.id } },
      orderBy: { createdAt: 'desc' },
      include: { membershipPayment: true },
    });
    if (!payment) {
      throw new NotFoundException('No hay ningún pago con tarjeta iniciado para tu membresía.');
    }
    if (payment.status === PaymentStatus.PAID) {
      return { payment, membershipPayment: payment.membershipPayment };
    }

    const result = await this.payments.confirmPayment(payment.id, simulateFailure ? 'failure' : 'success');
    if (result.status !== PaymentStatus.PAID) {
      return { payment: result, membershipPayment: payment.membershipPayment };
    }

    const membershipPayment = await this.prisma.$transaction((tx) =>
      this.settlePeriod(tx, payment.membershipPayment!, membership.plan, CARD_AUTO_REVIEWER, MembershipPaymentMethod.CARD),
    );
    return { payment: result, membershipPayment };
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
