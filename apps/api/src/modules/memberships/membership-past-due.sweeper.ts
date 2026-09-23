import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BusinessMembershipStatus, MembershipPaymentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MembershipsService } from './memberships.service';

/**
 * Owner's rule: a membership payment more than 5 days late blocks access. Three responsibilities,
 * always in this order:
 *
 *  1. initializeFirstPeriods — nothing in this codebase auto-generates a business's first billing
 *     period today (see the MembershipPayment model comment): a fresh TRIAL membership's
 *     currentPeriodStart/End sit null until either this runs or a payment is verified. Once
 *     trialEndsAt has passed, the trial itself becomes the first "period" that's due — its end is
 *     exactly trialEndsAt.
 *  2. generateDuePayments — the moment a membership's currentPeriodEnd is actually reached (the
 *     billing cutoff), a PENDING MembershipPayment placeholder must exist for that period —
 *     MembershipsService.generateDuePaymentIfMissing does the actual work (amount, discount
 *     application, dueDate = now + 5 days) and is a no-op when a row already exists (e.g. the
 *     business paid proactively via submitPayment before cutoff ever fired). A membership whose
 *     currentPeriodEnd was pushed forward by a live FREE_MONTHS/FREE_TRIAL_EXTENSION coupon simply
 *     doesn't match the `currentPeriodEnd <= now` filter yet — no separate "is this covered by a
 *     free grant" check needed.
 *  3. flagOverdue — MembershipPayment.dueDate (not currentPeriodEnd + 5 days — that's now only an
 *     implicit fallback baked into how dueDate got set) is the one authoritative deadline. For
 *     each membership with an overdue row, only the MOST RECENT payment row for that period
 *     decides the outcome: if it's still PENDING with no receipt attached, or REJECTED (and
 *     nothing newer was submitted for the same period), the membership flips to PAST_DUE — which
 *     is what MembershipsService.hasBenefit already treats as not-in-good-standing, and what every
 *     customer-facing read/eligibility site gated via membership-visibility.util.ts now treats as
 *     invisible. A row that's PENDING WITH a receipt attached (submitted in time, just not yet
 *     reviewed by an admin) is deliberately never flagged even past its dueDate — the business
 *     acted before the deadline, an admin review backlog shouldn't punish it.
 *
 * Plain DB-polling @Cron, not a per-record timer — same pattern as
 * OrphanedOrderRetrySweeper/OfferTimeoutSweeper, so nothing is lost on a Render restart. Once a
 * day is plenty for a 5-day grace window (unlike the delivery sweepers' 10-20s cadence).
 */
@Injectable()
export class MembershipPastDueSweeper {
  private readonly logger = new Logger('MembershipPastDueSweeper');

  constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: MembershipsService,
  ) {}

  @Cron('0 3 * * *')
  async sweep(): Promise<void> {
    await this.initializeFirstPeriods();
    await this.generateDuePayments();
    await this.flagOverdue();
  }

  private async initializeFirstPeriods(): Promise<void> {
    const now = new Date();
    const needsInit = await this.prisma.businessMembership.findMany({
      where: {
        status: BusinessMembershipStatus.TRIAL,
        currentPeriodEnd: null,
        trialEndsAt: { lt: now },
      },
      select: { id: true, businessId: true, createdAt: true, trialEndsAt: true },
    });

    for (const membership of needsInit) {
      await this.prisma.businessMembership.update({
        where: { id: membership.id },
        data: { currentPeriodStart: membership.createdAt, currentPeriodEnd: membership.trialEndsAt },
      });
      this.logger.log(`Business ${membership.businessId} trial ended — first billing period now due.`);
    }
  }

  private async generateDuePayments(): Promise<void> {
    const now = new Date();
    const due = await this.prisma.businessMembership.findMany({
      where: {
        status: { in: [BusinessMembershipStatus.TRIAL, BusinessMembershipStatus.ACTIVE] },
        currentPeriodEnd: { lte: now },
      },
      include: { plan: { select: { price: true, currency: true } } },
    });

    for (const membership of due) {
      const created = await this.memberships.generateDuePaymentIfMissing(membership);
      if (created) {
        this.logger.log(
          `Business ${membership.businessId} membership period ended — auto-generated a PENDING payment due ${created.dueDate?.toISOString()}.`,
        );
      }
    }
  }

  private async flagOverdue(): Promise<void> {
    const now = new Date();
    const overdueRows = await this.prisma.membershipPayment.findMany({
      where: {
        dueDate: { lt: now },
        membership: { status: { in: [BusinessMembershipStatus.TRIAL, BusinessMembershipStatus.ACTIVE] } },
      },
      orderBy: { createdAt: 'desc' },
      select: { membershipId: true, status: true, receiptUrl: true },
    });
    if (overdueRows.length === 0) return;

    // Only the most recent overdue-dueDate row per membership decides the outcome — a later
    // VERIFIED (paid late but before the sweeper ran) or a resubmitted PENDING-with-receipt row
    // supersedes an older REJECTED/unsubmitted one for the same membership.
    const latestByMembership = new Map<string, (typeof overdueRows)[number]>();
    for (const row of overdueRows) {
      if (!latestByMembership.has(row.membershipId)) latestByMembership.set(row.membershipId, row);
    }

    for (const [membershipId, row] of latestByMembership) {
      const unresolved =
        row.status === MembershipPaymentStatus.REJECTED ||
        (row.status === MembershipPaymentStatus.PENDING && !row.receiptUrl);
      if (!unresolved) continue;

      await this.prisma.businessMembership.update({
        where: { id: membershipId },
        data: { status: BusinessMembershipStatus.PAST_DUE },
      });
      this.logger.warn(
        `Business membership ${membershipId} marked PAST_DUE — payment due date passed with no receipt submitted or it was rejected.`,
      );
    }
  }
}
