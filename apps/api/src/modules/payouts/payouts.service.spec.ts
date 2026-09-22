import { PayeeType, Prisma, PayoutStatus, RiderEarningStatus } from '@prisma/client';
import { PayoutsService } from './payouts.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('PayoutsService', () => {
  let service: PayoutsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      riderEarning: { groupBy: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
      rider: { findMany: jest.fn() },
      order: { groupBy: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
      business: { findMany: jest.fn() },
      commission: { findMany: jest.fn(), findFirst: jest.fn() },
      payout: { create: jest.fn() },
      $transaction: jest.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
    };
    service = new PayoutsService(prisma as unknown as PrismaService);
  });

  describe('listPendingRiders', () => {
    it('returns an empty list with zero total when nothing is outstanding', async () => {
      prisma.riderEarning.groupBy.mockResolvedValue([]);
      const result = await service.listPendingRiders();
      expect(result).toEqual({ total: 0, items: [] });
      expect(prisma.rider.findMany).not.toHaveBeenCalled();
    });

    it('sums net earnings per rider and the grand total', async () => {
      prisma.riderEarning.groupBy.mockResolvedValue([
        { riderId: 'r1', _sum: { netAmount: new Prisma.Decimal('10.50') }, _count: { _all: 3 } },
        { riderId: 'r2', _sum: { netAmount: new Prisma.Decimal('5.25') }, _count: { _all: 1 } },
      ]);
      prisma.rider.findMany.mockResolvedValue([
        { id: 'r1', user: { firstName: 'Ana', lastName: 'Lopez', email: 'ana@x.com' } },
        { id: 'r2', user: { firstName: 'Beto', lastName: 'Diaz', email: 'beto@x.com' } },
      ]);

      const result = await service.listPendingRiders();

      expect(prisma.riderEarning.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: RiderEarningStatus.PENDING, payoutId: null } }),
      );
      expect(result.total).toBeCloseTo(15.75);
      expect(result.items).toEqual([
        expect.objectContaining({ riderId: 'r1', riderName: 'Ana Lopez', amount: 10.5, earningsCount: 3 }),
        expect.objectContaining({ riderId: 'r2', riderName: 'Beto Diaz', amount: 5.25, earningsCount: 1 }),
      ]);
    });
  });

  describe('markRidersPaid', () => {
    it('creates a PAID payout covering exactly the rider’s outstanding earnings and stamps payoutId on them', async () => {
      const createdAt1 = new Date('2026-01-01');
      const createdAt2 = new Date('2026-01-05');
      prisma.riderEarning.findMany.mockResolvedValue([
        { id: 'e1', netAmount: new Prisma.Decimal('10'), createdAt: createdAt1 },
        { id: 'e2', netAmount: new Prisma.Decimal('5'), createdAt: createdAt2 },
      ]);
      prisma.payout.create.mockResolvedValue({ id: 'payout1' });
      prisma.riderEarning.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.markRidersPaid(['r1'], 'admin1');

      expect(prisma.riderEarning.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { riderId: 'r1', status: RiderEarningStatus.PENDING, payoutId: null } }),
      );
      expect(prisma.payout.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            payeeType: PayeeType.RIDER,
            riderId: 'r1',
            status: PayoutStatus.PAID,
            periodStart: createdAt1,
          }),
        }),
      );
      expect(Number(prisma.payout.create.mock.calls[0][0].data.amount)).toBe(15);
      expect(prisma.riderEarning.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['e1', 'e2'] }, payoutId: null },
        data: { payoutId: 'payout1', status: RiderEarningStatus.PAID },
      });
      expect(result).toEqual({ paidCount: 1, totalPaid: 15, payouts: [{ riderId: 'r1', amount: 15, payoutId: 'payout1' }] });
    });

    it('is idempotent — a rider with nothing outstanding is skipped, not errored', async () => {
      prisma.riderEarning.findMany.mockResolvedValue([]);

      const result = await service.markRidersPaid(['r1']);

      expect(prisma.payout.create).not.toHaveBeenCalled();
      expect(result).toEqual({ paidCount: 0, totalPaid: 0, payouts: [] });
    });

    it('throws if a concurrent request already swept some of the same earnings (race guard)', async () => {
      prisma.riderEarning.findMany.mockResolvedValue([{ id: 'e1', netAmount: new Prisma.Decimal('10'), createdAt: new Date() }]);
      prisma.payout.create.mockResolvedValue({ id: 'payout1' });
      prisma.riderEarning.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.markRidersPaid(['r1'])).rejects.toThrow('Otro proceso ya estaba pagando a este rider');
    });

    it('pays multiple riders independently in the same batch', async () => {
      prisma.riderEarning.findMany
        .mockResolvedValueOnce([{ id: 'e1', netAmount: new Prisma.Decimal('10'), createdAt: new Date() }])
        .mockResolvedValueOnce([{ id: 'e2', netAmount: new Prisma.Decimal('20'), createdAt: new Date() }]);
      prisma.payout.create.mockResolvedValueOnce({ id: 'p1' }).mockResolvedValueOnce({ id: 'p2' });
      prisma.riderEarning.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.markRidersPaid(['r1', 'r2']);

      expect(result.paidCount).toBe(2);
      expect(result.totalPaid).toBe(30);
    });
  });

  describe('listPendingBusinesses', () => {
    it('returns an empty list when there is no outstanding GMV', async () => {
      prisma.order.groupBy.mockResolvedValue([]);
      const result = await service.listPendingBusinesses();
      expect(result).toEqual({ total: 0, items: [] });
    });

    it('computes owed amount as GMV × (1 - commission rate), excluding businesses with no live rate', async () => {
      prisma.order.groupBy.mockResolvedValue([
        { businessId: 'b1', _sum: { subtotal: new Prisma.Decimal('100') }, _count: { _all: 4 } },
        { businessId: 'b2', _sum: { subtotal: new Prisma.Decimal('50') }, _count: { _all: 1 } },
      ]);
      prisma.business.findMany.mockResolvedValue([
        { id: 'b1', tradeName: 'Tienda Uno' },
        { id: 'b2', tradeName: 'Tienda Dos' },
      ]);
      // Only b1 has a live commission rate — b2 has none and must be excluded entirely.
      prisma.commission.findMany.mockResolvedValue([{ businessId: 'b1', rate: new Prisma.Decimal('0.2') }]);

      const result = await service.listPendingBusinesses();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual(
        expect.objectContaining({ businessId: 'b1', tradeName: 'Tienda Uno', gmv: 100, commissionRate: 0.2, amount: 80 }),
      );
      expect(result.total).toBe(80);
    });
  });

  describe('markBusinessesPaid', () => {
    it('creates a PAID payout for GMV × (1 - rate) and stamps payoutId on the covered orders', async () => {
      const createdAt = new Date('2026-02-01');
      prisma.order.findMany.mockResolvedValue([
        { id: 'o1', subtotal: new Prisma.Decimal('100'), createdAt },
        { id: 'o2', subtotal: new Prisma.Decimal('50'), createdAt },
      ]);
      prisma.commission.findFirst.mockResolvedValue({ rate: new Prisma.Decimal('0.1') });
      prisma.payout.create.mockResolvedValue({ id: 'payoutB1' });
      prisma.order.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.markBusinessesPaid(['b1']);

      expect(Number(prisma.payout.create.mock.calls[0][0].data.amount)).toBeCloseTo(135);
      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['o1', 'o2'] }, payoutId: null },
        data: { payoutId: 'payoutB1' },
      });
      expect(result).toEqual({ paidCount: 1, totalPaid: 135, payouts: [{ businessId: 'b1', amount: 135, payoutId: 'payoutB1' }] });
    });

    it('skips a business with outstanding orders but no live commission rate, without throwing', async () => {
      prisma.order.findMany.mockResolvedValue([{ id: 'o1', subtotal: new Prisma.Decimal('100'), createdAt: new Date() }]);
      prisma.commission.findFirst.mockResolvedValue(null);

      const result = await service.markBusinessesPaid(['b1']);

      expect(prisma.payout.create).not.toHaveBeenCalled();
      expect(result).toEqual({ paidCount: 0, totalPaid: 0, payouts: [] });
    });

    it('is idempotent — a business with no outstanding orders is skipped', async () => {
      prisma.order.findMany.mockResolvedValue([]);
      const result = await service.markBusinessesPaid(['b1']);
      expect(result).toEqual({ paidCount: 0, totalPaid: 0, payouts: [] });
    });
  });
});
