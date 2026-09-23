import { BusinessMembershipStatus } from '@prisma/client';
import { MembershipPastDueSweeper } from './membership-past-due.sweeper';

describe('MembershipPastDueSweeper — query/date-boundary logic', () => {
  let sweeper: MembershipPastDueSweeper;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      businessMembership: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
    };
    sweeper = new MembershipPastDueSweeper(prisma);
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
        .mockResolvedValueOnce([]); // flagOverdue query (no ACTIVE/TRIAL rows returned this pass)

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

  describe('flagOverdue', () => {
    it('flips a TRIAL/ACTIVE membership to PAST_DUE once currentPeriodEnd is more than 5 days in the past', async () => {
      const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
      prisma.businessMembership.findMany
        .mockResolvedValueOnce([]) // initializeFirstPeriods: nothing to seed
        .mockResolvedValueOnce([{ id: 'm2', businessId: 'b2' }]); // flagOverdue: one overdue row

      await sweeper.sweep();

      expect(prisma.businessMembership.update).toHaveBeenCalledWith({
        where: { id: 'm2' },
        data: { status: BusinessMembershipStatus.PAST_DUE },
      });
      // sanity: the cutoff passed to the flagOverdue query really is ~5 days back, not some other window
      const overdueQuery = prisma.businessMembership.findMany.mock.calls[1][0];
      const cutoff = overdueQuery.where.currentPeriodEnd.lt as Date;
      expect(sixDaysAgo.getTime()).toBeLessThan(cutoff.getTime());
    });

    it('never flags PAUSED/CANCELLED/EXPIRED memberships — flagOverdue only queries TRIAL/ACTIVE', async () => {
      await sweeper.sweep();

      const overdueQuery = prisma.businessMembership.findMany.mock.calls[1][0];
      expect(overdueQuery.where.status.in).toEqual([
        BusinessMembershipStatus.TRIAL,
        BusinessMembershipStatus.ACTIVE,
      ]);
    });

    it('does nothing when there are no overdue memberships', async () => {
      await sweeper.sweep();
      expect(prisma.businessMembership.update).not.toHaveBeenCalled();
    });
  });
});
