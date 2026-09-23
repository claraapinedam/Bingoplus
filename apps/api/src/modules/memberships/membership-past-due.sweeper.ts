import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BusinessMembershipStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const GRACE_PERIOD_MS = 5 * DAY_MS;

/**
 * Owner's rule: a membership payment more than 5 days late blocks access. "Blocks access" needs
 * no separate enforcement here — MembershipsService.hasBenefit already treats PAST_DUE (along
 * with CANCELLED/EXPIRED) as not-in-good-standing everywhere it's consulted; this sweeper's only
 * job is to actually flip BusinessMembership.status to PAST_DUE once a period has gone unpaid too
 * long, in two steps:
 *
 *  1. initializeFirstPeriods — nothing in this codebase auto-generates a business's first billing
 *     period today (see the MembershipPayment model comment): a fresh TRIAL membership's
 *     currentPeriodStart/End sit null until either this runs or a payment is verified. Once
 *     trialEndsAt has passed, the trial itself becomes the first "period" that's due — its end is
 *     exactly trialEndsAt.
 *  2. flagOverdue — MembershipsService.verifyPayment is the ONLY thing that ever moves
 *     currentPeriodEnd forward, so a currentPeriodEnd that's still sitting more than 5 days in the
 *     past IS the "still unpaid" signal — no separate join against MembershipPayment needed.
 *
 * Plain DB-polling @Cron, not a per-record timer — same pattern as
 * OrphanedOrderRetrySweeper/OfferTimeoutSweeper, so nothing is lost on a Render restart. Once a
 * day is plenty for a 5-day grace window (unlike the delivery sweepers' 10-20s cadence).
 */
@Injectable()
export class MembershipPastDueSweeper {
  private readonly logger = new Logger('MembershipPastDueSweeper');

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 3 * * *')
  async sweep(): Promise<void> {
    await this.initializeFirstPeriods();
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

  private async flagOverdue(): Promise<void> {
    const cutoff = new Date(Date.now() - GRACE_PERIOD_MS);

    const overdue = await this.prisma.businessMembership.findMany({
      where: {
        status: { in: [BusinessMembershipStatus.TRIAL, BusinessMembershipStatus.ACTIVE] },
        currentPeriodEnd: { lt: cutoff },
      },
      select: { id: true, businessId: true },
    });
    if (overdue.length === 0) return;

    for (const membership of overdue) {
      await this.prisma.businessMembership.update({
        where: { id: membership.id },
        data: { status: BusinessMembershipStatus.PAST_DUE },
      });
      this.logger.warn(
        `Business ${membership.businessId} membership marked PAST_DUE — no payment verified within 5 days of period end.`,
      );
    }
  }
}
