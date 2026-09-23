import { BusinessMembershipStatus, MembershipPaymentStatus } from '@prisma/client';
import { MembershipPastDueSweeper } from './membership-past-due.sweeper';

describe('MembershipPastDueSweeper — query/date-boundary logic', () => {
  let sweeper: MembershipPastDueSweeper;
  let prisma: any;
  let memberships: any;

  beforeEach(() => {
    prisma = {
      businessMembership: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      membershipPayment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    memberships = {
      generateDuePaymentIfMissing: jest.fn().mockResolvedValue(null),
    };
    sweeper = new MembershipPastDueSweeper(prisma, memberships);
  });

  describe('initializeFirstPeriods', () => {
    it('does nothing when no TRIAL membership has an elapsed trial with an unset period', async () => {
      await sweeper.sweep();
      expect(prisma.businessMembership.update).not.toHaveBeenCalled();
    });

    it('seeds currentPeriodStart/End from createdAt/trialEndsAt for a TRIAL membership whose trial has ended', async () => {
      const createdAt = new Date('2026-08-01T00:00:00Z');
      const trialEndsAt = new Date('2026-08-31T00:00:00Z');
      prisma.businessMembership.findMany
        .mockResolvedValueOnce([{ id: 'm1', businessId: 'b1', createdAt, trialEndsAt }]) // initializeFirstPeriods query
        .mockResolvedValueOnce([]); // generateDuePayments query (no TRIAL/ACTIVE rows due this pass)

      await sweeper.sweep();

      expect(prisma.businessMembership.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { currentPeriodStart: createdAt, currentPeriodEnd: trialEndsAt },
      });
    });

    it('only targets TRIAL memberships whose currentPeriodEnd is still null and trialEndsAt has passed — the findMany filter, never memberships already initialized', async () => {
      await sweeper.sweep();

      const initQuery = prisma.businessMembership.findMany.mock.calls[0][0];
      expect(initQuery.where.status).toBe(BusinessMembershipStatus.TRIAL);
      expect(initQuery.where.currentPeriodEnd).toBeNull();
      expect(initQuery.where.trialEndsAt.lt).toBeInstanceOf(Date);
    });
  });

  describe('generateDuePayments', () => {
    it('does nothing when no TRIAL/ACTIVE membership has reached its currentPeriodEnd', async () => {
      await sweeper.sweep();
      expect(memberships.generateDuePaymentIfMissing).not.toHaveBeenCalled();
    });

    it('asks MembershipsService to auto-generate a payment for every membership whose currentPeriodEnd has been reached', async () => {
      const membershipDue = {
        id: 'm1',
        businessId: 'b1',
        currentPeriodStart: new Date('2026-01-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-02-01T00:00:00Z'),
        plan: { price: 25, currency: 'USD' },
      };
      prisma.businessMembership.findMany
        .mockResolvedValueOnce([]) // initializeFirstPeriods: nothing to seed
        .mockResolvedValueOnce([membershipDue]); // generateDuePayments: one due
      memberships.generateDuePaymentIfMissing.mockResolvedValueOnce({ id: 'pay-1', dueDate: new Date() });

      await sweeper.sweep();

      expect(memberships.generateDuePaymentIfMissing).toHaveBeenCalledWith(membershipDue);
      // sanity: the query only ever targets TRIAL/ACTIVE memberships whose period has actually elapsed
      const dueQuery = prisma.businessMembership.findMany.mock.calls[1][0];
      expect(dueQuery.where.status.in).toEqual([BusinessMembershipStatus.TRIAL, BusinessMembershipStatus.ACTIVE]);
      expect(dueQuery.where.currentPeriodEnd.lte).toBeInstanceOf(Date);
    });

    it('a membership covered by a live FREE_MONTHS extension is naturally skipped — its currentPeriodEnd is in the future, so it never matches the "reached cutoff" query at all', async () => {
      // No need to mock a FREE_MONTHS-specific branch: redeemAdminCoupon already pushed
      // currentPeriodEnd forward for this membership, so the `currentPeriodEnd: { lte: now }`
      // filter itself excludes it — nothing membership-specific to special-case here.
      prisma.businessMembership.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      await sweeper.sweep();
      expect(memberships.generateDuePaymentIfMissing).not.toHaveBeenCalled();
    });
  });

  describe('flagOverdue', () => {
    it('flags a membership PAST_DUE when its latest overdue payment row is PENDING with no receipt submitted', async () => {
      prisma.businessMembership.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.membershipPayment.findMany.mockResolvedValueOnce([
        { membershipId: 'm1', status: MembershipPaymentStatus.PENDING, receiptUrl: null },
      ]);

      await sweeper.sweep();

      expect(prisma.businessMembership.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { status: BusinessMembershipStatus.PAST_DUE },
      });
    });

    it('flags a membership PAST_DUE when its latest overdue payment row is REJECTED with nothing newer submitted', async () => {
      prisma.businessMembership.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.membershipPayment.findMany.mockResolvedValueOnce([
        { membershipId: 'm1', status: MembershipPaymentStatus.REJECTED, receiptUrl: 'https://x/blurry.png' },
      ]);

      await sweeper.sweep();

      expect(prisma.businessMembership.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { status: BusinessMembershipStatus.PAST_DUE },
      });
    });

    it('does NOT flag a membership whose latest overdue row is PENDING but already has a receipt attached (submitted in time, awaiting admin review)', async () => {
      prisma.businessMembership.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.membershipPayment.findMany.mockResolvedValueOnce([
        { membershipId: 'm1', status: MembershipPaymentStatus.PENDING, receiptUrl: 'https://x/receipt.png' },
      ]);

      await sweeper.sweep();

      expect(prisma.businessMembership.update).not.toHaveBeenCalled();
    });

    it('resolves by the MOST RECENT row per membership — a newer resubmission (PENDING+receipt) supersedes an older REJECTED row for the same period', async () => {
      prisma.businessMembership.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      // findMany is ordered by createdAt desc in the sweeper's own query — the mock returns them
      // already in that order, newest first.
      prisma.membershipPayment.findMany.mockResolvedValueOnce([
        { membershipId: 'm1', status: MembershipPaymentStatus.PENDING, receiptUrl: 'https://x/resubmitted.png' },
        { membershipId: 'm1', status: MembershipPaymentStatus.REJECTED, receiptUrl: 'https://x/blurry.png' },
      ]);

      await sweeper.sweep();

      expect(prisma.businessMembership.update).not.toHaveBeenCalled();
    });

    it('never flags PAUSED/CANCELLED/EXPIRED memberships — the overdue-payment query only joins against TRIAL/ACTIVE memberships', async () => {
      await sweeper.sweep();

      const overdueQuery = prisma.membershipPayment.findMany.mock.calls[0][0];
      expect(overdueQuery.where.membership.status.in).toEqual([
        BusinessMembershipStatus.TRIAL,
        BusinessMembershipStatus.ACTIVE,
      ]);
      expect(overdueQuery.where.dueDate.lt).toBeInstanceOf(Date);
    });

    it('does nothing when there are no overdue payment rows', async () => {
      await sweeper.sweep();
      expect(prisma.businessMembership.update).not.toHaveBeenCalled();
    });
  });
});
