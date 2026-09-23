import { NotFoundException } from '@nestjs/common';
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
      // Default to "no pending bookings anywhere" so existing Order-only tests (which don't set
      // this up themselves) see bookingAmount/bookingsCount as 0 and keep their pre-existing
      // expectations — see the "listPendingBusinesses — combined with Bookings" describe block for
      // tests that actually configure these.
      booking: { groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
      business: { findMany: jest.fn() },
      commission: { findMany: jest.fn(), findFirst: jest.fn() },
      payout: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
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

    it('keeps a fully-paid rider in the list at amount 0 instead of vanishing (they must stay clickable for their Pagado history)', async () => {
      // First call (by riderId, no where) — every rider with ANY earnings history, paid or not.
      prisma.riderEarning.groupBy
        .mockResolvedValueOnce([{ riderId: 'r1', _count: { _all: 2 } }])
        // Second call (where PENDING/payoutId null) — nothing currently pending for r1.
        .mockResolvedValueOnce([]);
      prisma.rider.findMany.mockResolvedValue([{ id: 'r1', user: { firstName: 'Ana', lastName: 'Lopez', email: 'ana@x.com' } }]);

      const result = await service.listPendingRiders();

      expect(result.total).toBe(0);
      expect(result.items).toEqual([expect.objectContaining({ riderId: 'r1', riderName: 'Ana Lopez', amount: 0, earningsCount: 0 })]);
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

    it('keeps a fully-paid business in the list at amount 0 instead of vanishing, even with no live commission rate', async () => {
      // First call (by businessId, no payoutId filter) — every business with ANY qualifying order ever.
      prisma.order.groupBy.mockResolvedValueOnce([{ businessId: 'b1' }]).mockResolvedValueOnce([]);
      prisma.business.findMany.mockResolvedValue([{ id: 'b1', tradeName: 'Tienda Uno' }]);
      prisma.commission.findMany.mockResolvedValue([]); // no live rate at all — must not exclude a $0 business

      const result = await service.listPendingBusinesses();

      expect(result.total).toBe(0);
      expect(result.items).toEqual([expect.objectContaining({ businessId: 'b1', tradeName: 'Tienda Uno', gmv: 0, amount: 0 })]);
    });

    it('folds in card-paid service bookings (price + tax, no commission) as a separate bookingAmount, summed into the combined amount', async () => {
      prisma.order.groupBy.mockResolvedValue([]); // this business has no product orders at all
      prisma.booking.groupBy.mockResolvedValue([
        { businessId: 'b1', _sum: { price: new Prisma.Decimal('50'), tax: new Prisma.Decimal('5') }, _count: { _all: 2 } },
      ]);
      prisma.business.findMany.mockResolvedValue([{ id: 'b1', tradeName: 'Peluquería Canina' }]);
      prisma.commission.findMany.mockResolvedValue([]); // no commission row at all — must not block a booking-only business

      const result = await service.listPendingBusinesses();

      expect(result.items).toEqual([
        expect.objectContaining({
          businessId: 'b1',
          tradeName: 'Peluquería Canina',
          bookingsCount: 2,
          orderAmount: 0,
          bookingAmount: 55, // price + tax, serviceFee excluded
          amount: 55,
        }),
      ]);
      expect(result.total).toBe(55);
    });

    it('never lets a booking amount include the serviceFee, even when the config has a nonzero one', async () => {
      prisma.order.groupBy.mockResolvedValue([]);
      // groupBy _sum only ever includes price/tax by construction (see the service) — this test
      // pins that contract: a booking with a real serviceFee still only ever contributes price+tax.
      prisma.booking.groupBy.mockResolvedValue([
        { businessId: 'b1', _sum: { price: new Prisma.Decimal('100'), tax: new Prisma.Decimal('10') }, _count: { _all: 1 } },
      ]);
      prisma.business.findMany.mockResolvedValue([{ id: 'b1', tradeName: 'Spa de Mascotas' }]);
      prisma.commission.findMany.mockResolvedValue([]);

      const result = await service.listPendingBusinesses();

      expect(result.items[0].bookingAmount).toBe(110);
      expect(prisma.booking.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ _sum: { price: true, tax: true } }),
      );
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

  describe('getRiderPending — per-rider drilldown', () => {
    it('lists individual pending earnings with their sum', async () => {
      prisma.riderEarning.findMany.mockResolvedValue([
        {
          id: 'e1',
          deliveryId: 'd1',
          grossAmount: new Prisma.Decimal('12.5'),
          commissionAmount: new Prisma.Decimal('2.5'),
          taxWithheldAmount: new Prisma.Decimal('1'),
          netAmount: new Prisma.Decimal('9'),
          createdAt: new Date('2026-01-01'),
        },
      ]);
      const result = await service.getRiderPending('r1');
      expect(prisma.riderEarning.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { riderId: 'r1', status: RiderEarningStatus.PENDING, payoutId: null } }),
      );
      expect(result.total).toBe(9);
      expect(result.items[0]).toEqual(expect.objectContaining({ id: 'e1', netAmount: 9, grossAmount: 12.5 }));
    });
  });

  describe('getRiderPaidHistory', () => {
    it('lists past payouts for that rider with their reference number', async () => {
      prisma.payout.findMany.mockResolvedValue([
        { id: 'p1', amount: new Prisma.Decimal('9'), paidAt: new Date('2026-01-02'), referenceNumber: 'REF-1', _count: { riderEarnings: 1 } },
      ]);
      const result = await service.getRiderPaidHistory('r1');
      expect(prisma.payout.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { payeeType: PayeeType.RIDER, riderId: 'r1', status: PayoutStatus.PAID } }),
      );
      expect(result).toEqual([{ id: 'p1', amount: 9, paidAt: new Date('2026-01-02'), referenceNumber: 'REF-1', earningsCount: 1 }]);
    });
  });

  describe('markRiderEarningsPaid — item-level, single rider', () => {
    it('pays exactly the selected earnings and records the reference number', async () => {
      prisma.riderEarning.findMany.mockResolvedValue([{ id: 'e1', netAmount: new Prisma.Decimal('9'), createdAt: new Date('2026-01-01') }]);
      prisma.payout.create.mockResolvedValue({ id: 'p1' });
      prisma.riderEarning.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.markRiderEarningsPaid('r1', ['e1'], 'REF-1');

      expect(prisma.payout.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ riderId: 'r1', referenceNumber: 'REF-1' }) }),
      );
      expect(result).toEqual({ payoutId: 'p1', amount: 9, earningsCount: 1 });
    });

    it('rejects if none of the selected earnings are actually still pending', async () => {
      prisma.riderEarning.findMany.mockResolvedValue([]);
      await expect(service.markRiderEarningsPaid('r1', ['e1'])).rejects.toThrow('ya no están pendientes');
    });
  });

  describe('getBusinessPending — per-business drilldown', () => {
    it('lists individual pending orders with GMV/commission/monto a pagar per order', async () => {
      prisma.commission.findFirst.mockResolvedValue({ rate: new Prisma.Decimal('0.2') });
      prisma.order.findMany.mockResolvedValue([
        { id: 'o1', orderNumber: 'ORD-1', subtotal: new Prisma.Decimal('100'), status: 'COMPLETED', createdAt: new Date('2026-01-01') },
      ]);
      const result = await service.getBusinessPending('b1');
      expect(result.hasCommissionRate).toBe(true);
      expect(result.items[0]).toEqual(
        expect.objectContaining({ id: 'o1', orderNumber: 'ORD-1', gmv: 100, commissionAmount: 20, amount: 80 }),
      );
      expect(result.total).toBe(80);
    });

    it('flags hasCommissionRate=false rather than guessing a rate', async () => {
      prisma.commission.findFirst.mockResolvedValue(null);
      prisma.order.findMany.mockResolvedValue([
        { id: 'o1', orderNumber: 'ORD-1', subtotal: new Prisma.Decimal('100'), status: 'COMPLETED', createdAt: new Date() },
      ]);
      const result = await service.getBusinessPending('b1');
      expect(result.hasCommissionRate).toBe(false);
      expect(result.items[0].commissionAmount).toBe(0);
    });
  });

  describe('getBusinessPaidHistory', () => {
    it('lists past payouts for that business', async () => {
      prisma.payout.findMany.mockResolvedValue([
        { id: 'p1', amount: new Prisma.Decimal('80'), paidAt: new Date('2026-01-02'), referenceNumber: null, _count: { orders: 1 } },
      ]);
      const result = await service.getBusinessPaidHistory('b1');
      expect(result).toEqual([{ id: 'p1', amount: 80, paidAt: new Date('2026-01-02'), referenceNumber: null, ordersCount: 1 }]);
    });
  });

  describe('markBusinessOrdersPaid — item-level, single business', () => {
    it('pays exactly the selected orders', async () => {
      prisma.commission.findFirst.mockResolvedValue({ rate: new Prisma.Decimal('0.2') });
      prisma.order.findMany.mockResolvedValue([{ id: 'o1', subtotal: new Prisma.Decimal('100'), createdAt: new Date('2026-01-01') }]);
      prisma.payout.create.mockResolvedValue({ id: 'p1' });
      prisma.order.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.markBusinessOrdersPaid('b1', ['o1'], 'REF-9');

      expect(prisma.payout.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ businessId: 'b1', referenceNumber: 'REF-9' }) }),
      );
      expect(result).toEqual({ payoutId: 'p1', amount: 80, ordersCount: 1 });
    });

    it('refuses without a live commission rate rather than guessing one', async () => {
      prisma.commission.findFirst.mockResolvedValue(null);
      await expect(service.markBusinessOrdersPaid('b1', ['o1'])).rejects.toThrow('tasa de comisión vigente');
    });
  });

  describe('getBusinessBookingsPending — service bookings, no commission concept', () => {
    it('lists individual pending card-paid bookings with price/tax/withheld serviceFee shown separately', async () => {
      prisma.booking.findMany.mockResolvedValue([
        {
          id: 'bk1',
          price: new Prisma.Decimal('50'),
          tax: new Prisma.Decimal('5'),
          serviceFee: new Prisma.Decimal('3'),
          status: 'COMPLETED',
          createdAt: new Date('2026-01-01'),
          service: { name: 'Baño y corte' },
        },
      ]);
      const result = await service.getBusinessBookingsPending('b1');
      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            businessId: 'b1',
            payoutId: null,
            payment: { is: { status: 'PAID', provider: { not: 'CASH' } } },
          }),
        }),
      );
      expect(result.items[0]).toEqual(
        expect.objectContaining({ id: 'bk1', serviceName: 'Baño y corte', price: 50, tax: 5, serviceFee: 3, amount: 55 }),
      );
      expect(result.total).toBe(55);
    });

    it('never includes the serviceFee in the pending total, only price + tax', async () => {
      prisma.booking.findMany.mockResolvedValue([
        { id: 'bk1', price: new Prisma.Decimal('100'), tax: new Prisma.Decimal('10'), serviceFee: new Prisma.Decimal('20'), status: 'COMPLETED', createdAt: new Date(), service: { name: 'X' } },
      ]);
      const result = await service.getBusinessBookingsPending('b1');
      expect(result.total).toBe(110); // never 130
    });
  });

  describe('getBusinessBookingsPaidHistory', () => {
    it('lists past booking-sourced payouts for that business', async () => {
      prisma.payout.findMany.mockResolvedValue([
        { id: 'p1', amount: new Prisma.Decimal('55'), paidAt: new Date('2026-01-02'), referenceNumber: null, _count: { bookings: 1 } },
      ]);
      const result = await service.getBusinessBookingsPaidHistory('b1');
      expect(prisma.payout.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ businessId: 'b1', bookings: { some: {} } }) }),
      );
      expect(result).toEqual([{ id: 'p1', amount: 55, paidAt: new Date('2026-01-02'), referenceNumber: null, bookingsCount: 1 }]);
    });
  });

  describe('markBusinessBookingItemsPaid — item-level, single business, never requires a commission rate', () => {
    it('pays exactly the selected bookings for price + tax, excluding the serviceFee', async () => {
      prisma.booking.findMany.mockResolvedValue([
        { id: 'bk1', price: new Prisma.Decimal('50'), tax: new Prisma.Decimal('5'), createdAt: new Date('2026-01-01') },
      ]);
      prisma.payout.create.mockResolvedValue({ id: 'p1' });
      prisma.booking.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.markBusinessBookingItemsPaid('b1', ['bk1'], 'REF-9');

      expect(prisma.commission.findFirst).not.toHaveBeenCalled(); // bookings never need a commission rate
      expect(prisma.payout.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ businessId: 'b1', referenceNumber: 'REF-9' }) }),
      );
      expect(Number(prisma.payout.create.mock.calls[0][0].data.amount)).toBeCloseTo(55);
      expect(prisma.booking.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['bk1'] }, payoutId: null },
        data: { payoutId: 'p1' },
      });
      expect(result).toEqual({ payoutId: 'p1', amount: 55, bookingsCount: 1 });
    });

    it('rejects if none of the selected bookings are actually still pending', async () => {
      prisma.booking.findMany.mockResolvedValue([]);
      await expect(service.markBusinessBookingItemsPaid('b1', ['bk1'])).rejects.toThrow('ya no están pendientes');
    });

    it('never includes a CASH-paid booking, even if selected', async () => {
      // A CASH booking would never match CARD_PAID_BOOKING_WHERE in the underlying query — the
      // mock simulates that by returning nothing for it.
      prisma.booking.findMany.mockResolvedValue([]);
      await expect(service.markBusinessBookingItemsPaid('b1', ['cash-booking-1'])).rejects.toThrow('ya no están pendientes');
      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ payment: { is: { status: 'PAID', provider: { not: 'CASH' } } } }),
        }),
      );
    });
  });

  describe('markBusinessBookingsPaid — whole balance, never requires a commission rate', () => {
    it('creates a PAID payout for price+tax across all pending bookings and stamps payoutId', async () => {
      const createdAt = new Date('2026-02-01');
      prisma.booking.findMany.mockResolvedValue([
        { id: 'bk1', price: new Prisma.Decimal('50'), tax: new Prisma.Decimal('5'), createdAt },
        { id: 'bk2', price: new Prisma.Decimal('30'), tax: new Prisma.Decimal('0'), createdAt },
      ]);
      prisma.payout.create.mockResolvedValue({ id: 'payoutB1' });
      prisma.booking.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.markBusinessBookingsPaid(['b1']);

      expect(prisma.commission.findFirst).not.toHaveBeenCalled();
      expect(Number(prisma.payout.create.mock.calls[0][0].data.amount)).toBeCloseTo(85);
      expect(prisma.booking.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['bk1', 'bk2'] }, payoutId: null },
        data: { payoutId: 'payoutB1' },
      });
      expect(result).toEqual({ paidCount: 1, totalPaid: 85, payouts: [{ businessId: 'b1', amount: 85, payoutId: 'payoutB1' }] });
    });

    it('is idempotent — a business with no outstanding bookings is skipped', async () => {
      prisma.booking.findMany.mockResolvedValue([]);
      const result = await service.markBusinessBookingsPaid(['b1']);
      expect(result).toEqual({ paidCount: 0, totalPaid: 0, payouts: [] });
      expect(prisma.payout.create).not.toHaveBeenCalled();
    });
  });

  describe('updatePayoutReference', () => {
    it('updates the reference number on an existing payout', async () => {
      prisma.payout.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.payout.update.mockResolvedValue({ id: 'p1', referenceNumber: 'REF-2' });
      const result = await service.updatePayoutReference('p1', 'REF-2');
      expect(prisma.payout.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { referenceNumber: 'REF-2' } });
      expect(result.referenceNumber).toBe('REF-2');
    });

    it('404s on an unknown payout', async () => {
      prisma.payout.findUnique.mockResolvedValue(null);
      await expect(service.updatePayoutReference('ghost', 'REF-2')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
