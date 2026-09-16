import { resolveDateRange } from '@bingoplus/utils';
import { BusinessAnalyticsService } from './business-analytics.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessCapabilitiesService } from '../business-capabilities/business-capabilities.service';

describe('resolveDateRange (shared by Business + Admin analytics)', () => {
  const now = new Date('2026-09-16T15:00:00.000Z');

  it('"today" spans just the current calendar day', () => {
    const range = resolveDateRange({ preset: 'today' }, now);
    expect(range.from.getDate()).toBe(now.getDate());
    expect(range.to.getDate()).toBe(now.getDate());
    expect(range.from.getHours()).toBe(0);
    expect(range.to.getHours()).toBe(23);
  });

  it('"last_7_days" spans exactly 7 calendar days (today plus the 6 before it)', () => {
    const range = resolveDateRange({ preset: 'last_7_days' }, now);
    const days = Math.round((range.to.getTime() - range.from.getTime()) / (24 * 60 * 60 * 1000));
    expect(days).toBe(7);
  });

  it('"this_month" starts on the 1st of the current month', () => {
    const range = resolveDateRange({ preset: 'this_month' }, now);
    expect(range.from.getDate()).toBe(1);
    expect(range.from.getMonth()).toBe(now.getMonth());
  });

  it('"last_month" spans the entire previous calendar month, not into this one', () => {
    const range = resolveDateRange({ preset: 'last_month' }, now);
    expect(range.from.getMonth()).toBe(now.getMonth() - 1);
    expect(range.to.getMonth()).toBe(now.getMonth() - 1);
  });

  it('a custom range uses the given from/to verbatim (as day boundaries)', () => {
    const range = resolveDateRange({ from: '2026-01-01', to: '2026-01-31' }, now);
    expect(range.preset).toBe('custom');
    expect(range.from.getMonth()).toBe(0);
    expect(range.to.getMonth()).toBe(0);
  });
});

describe('BusinessAnalyticsService — capability gating (FASE 8 §1.1, RULE 7/8)', () => {
  let service: BusinessAnalyticsService;
  let prisma: any;
  let capabilities: any;

  beforeEach(() => {
    prisma = {
      order: { aggregate: jest.fn().mockResolvedValue({ _sum: { total: 0 }, _count: { _all: 0 } }), count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
      orderItem: { groupBy: jest.fn().mockResolvedValue([]) },
      product: { findMany: jest.fn().mockResolvedValue([]) },
      analyticsEvent: { count: jest.fn().mockResolvedValue(0) },
      favorite: { count: jest.fn().mockResolvedValue(0) },
      businessCoupon: { findMany: jest.fn().mockResolvedValue([]) },
      couponRedemption: { count: jest.fn().mockResolvedValue(0) },
      booking: { groupBy: jest.fn().mockResolvedValue([]), aggregate: jest.fn().mockResolvedValue({ _sum: { price: 0 } }) },
      service: { findMany: jest.fn().mockResolvedValue([]) },
    };
    capabilities = { getMap: jest.fn() };
    service = new BusinessAnalyticsService(prisma as unknown as PrismaService, capabilities as unknown as BusinessCapabilitiesService);
  });

  it('omits every section for a business with no relevant capability enabled', async () => {
    capabilities.getMap.mockResolvedValue({ SELLS_PRODUCTS: false, DIRECTORY_LISTING: false, SERVICES: false, BOOKINGS: false, COUPONS: false });
    const result = await service.getAnalytics('biz-1', {});
    expect(result.marketplace).toBeNull();
    expect(result.directory).toBeNull();
    expect(result.services).toBeNull();
  });

  it('only includes `marketplace` for a pure SELLS_PRODUCTS business — never `directory` or `services`', async () => {
    capabilities.getMap.mockResolvedValue({ SELLS_PRODUCTS: true, DIRECTORY_LISTING: false, SERVICES: false, BOOKINGS: false, COUPONS: false });
    const result = await service.getAnalytics('biz-1', {});
    expect(result.marketplace).not.toBeNull();
    expect(result.directory).toBeNull();
    expect(result.services).toBeNull();
  });

  it('includes `services` when BOOKINGS is enabled even if SERVICES is somehow off', async () => {
    capabilities.getMap.mockResolvedValue({ SELLS_PRODUCTS: false, DIRECTORY_LISTING: false, SERVICES: false, BOOKINGS: true, COUPONS: false });
    const result = await service.getAnalytics('biz-1', {});
    expect(result.services).not.toBeNull();
  });

  it('a Hybrid business (all capabilities) gets every section, never using category to decide', async () => {
    capabilities.getMap.mockResolvedValue({ SELLS_PRODUCTS: true, DIRECTORY_LISTING: true, SERVICES: true, BOOKINGS: true, COUPONS: true });
    const result = await service.getAnalytics('biz-1', {});
    expect(result.marketplace).not.toBeNull();
    expect(result.directory).not.toBeNull();
    expect(result.services).not.toBeNull();
    expect(result.directory!.coupons).not.toBeNull();
  });

  it('omits directory.coupons when COUPONS is disabled even though DIRECTORY_LISTING is on', async () => {
    capabilities.getMap.mockResolvedValue({ SELLS_PRODUCTS: false, DIRECTORY_LISTING: true, SERVICES: false, BOOKINGS: false, COUPONS: false });
    const result = await service.getAnalytics('biz-1', {});
    expect(result.directory!.coupons).toBeNull();
  });
});
