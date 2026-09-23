import { getBusinessOnlineStatus } from '@bingoplus/utils';

/**
 * Pure-function coverage for the connect/disconnect toggle's effective-status computation — the
 * same helper BusinessesService, CartService and CheckoutService all call server-side (never
 * reimplemented locally, per the shared-package convention already used for getOpeningStatus
 * itself, e.g. business-ranking.service.ts / directory.service.ts).
 */
describe('getBusinessOnlineStatus', () => {
  // A fixed "always open" schedule so these tests never flake depending on when they happen to run.
  const alwaysOpenHours = {
    sun: { open: '00:00', close: '23:59' },
    mon: { open: '00:00', close: '23:59' },
    tue: { open: '00:00', close: '23:59' },
    wed: { open: '00:00', close: '23:59' },
    thu: { open: '00:00', close: '23:59' },
    fri: { open: '00:00', close: '23:59' },
    sat: { open: '00:00', close: '23:59' },
  };
  const alwaysClosedHours = {
    sun: { open: '00:00', close: '00:01' },
    mon: { open: '00:00', close: '00:01' },
    tue: { open: '00:00', close: '00:01' },
    wed: { open: '00:00', close: '00:01' },
    thu: { open: '00:00', close: '00:01' },
    fri: { open: '00:00', close: '00:01' },
    sat: { open: '00:00', close: '00:01' },
  };
  const now = new Date('2026-01-15T12:00:00');

  it('with no override and no configured hours at all, defaults ONLINE — must not silently break an existing business that never set hours', () => {
    const result = getBusinessOnlineStatus(null, null, now);
    expect(result).toMatchObject({ online: true, source: 'SCHEDULE', isOpenNow: null });
  });

  it('with no override, follows the schedule: open now => online', () => {
    const result = getBusinessOnlineStatus(alwaysOpenHours, null, now);
    expect(result).toMatchObject({ online: true, source: 'SCHEDULE', isOpenNow: true });
  });

  it('with no override, follows the schedule: closed now => offline', () => {
    const result = getBusinessOnlineStatus(alwaysClosedHours, null, now);
    expect(result).toMatchObject({ online: false, source: 'SCHEDULE', isOpenNow: false });
  });

  it('a manual ONLINE override wins even while the schedule says closed', () => {
    const result = getBusinessOnlineStatus(alwaysClosedHours, 'ONLINE', now);
    expect(result).toMatchObject({ online: true, source: 'MANUAL', isOpenNow: false });
  });

  it('a manual OFFLINE override wins even while the schedule says open', () => {
    const result = getBusinessOnlineStatus(alwaysOpenHours, 'OFFLINE', now);
    expect(result).toMatchObject({ online: false, source: 'MANUAL', isOpenNow: true });
  });

  it('closesAt is only ever populated while actually open per the schedule', () => {
    const open = getBusinessOnlineStatus(alwaysOpenHours, null, now);
    expect(open.closesAt).toBe('11:59 PM');
    const closed = getBusinessOnlineStatus(alwaysClosedHours, null, now);
    expect(closed.closesAt).toBeNull();
  });
});
