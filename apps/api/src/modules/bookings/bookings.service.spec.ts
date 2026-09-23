import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BookingStatus, BusinessStatus, PaymentStatus, Prisma } from '@prisma/client';
import { BookingsService } from './bookings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PetsService } from '../pets/pets.service';
import { NotificationService } from '../notifications/notification.service';
import { PaymentService } from '../payments/payment.service';
import { PricingConfigService } from '../pricing/pricing-config.service';
import { BookingSlotUnavailableException } from '../../common/exceptions/booking-slot-unavailable.exception';

const DOG_SPECIES = { id: 'species-dog', slug: 'dog', name: 'Perro' };
const CAT_SPECIES = { id: 'species-cat', slug: 'cat', name: 'Gato' };

/** Formats a Date's LOCAL calendar date as "YYYY-MM-DD" — deliberately never `.toISOString()`,
 * which converts to UTC first: whenever the suite runs late enough in the evening that local time
 * is already past UTC midnight (anywhere west of UTC, e.g. `new Date()` at 19:20 in UTC-5 is
 * already 00:20 UTC the *next* day), that conversion silently shifts every "today"/"+N days"
 * fixture forward by a day and desyncs it from what setDate() actually computed in local time. */
function toLocalDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function futureDateString(daysAhead = 30): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return toLocalDateString(d);
}

/** A Monday at least 30 days out, regardless of what day the suite happens to run on — needed to
 * deterministically test operatingDays weekday filtering. */
function futureMondayDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  const diffToMonday = (8 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + diffToMonday);
  return toLocalDateString(d);
}

// Same weekday-indexing convention as BookingsService's own (unexported) WEEKDAY_KEYS — kept as a
// local copy purely to build fixtures, same reasoning as that file's own comment on the constant.
const WEEKDAY_KEYS_LOCAL = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function addDaysToDateString(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toLocalDateString(d);
}

describe('BookingsService', () => {
  let service: BookingsService;
  let prisma: any;
  let pets: any;
  let notifications: any;
  let payments: any;
  let pricingConfig: any;

  beforeEach(() => {
    prisma = {
      booking: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        update: jest.fn(),
      },
      service: { findUnique: jest.fn(), findFirst: jest.fn() },
      businessCapability: { findUnique: jest.fn().mockResolvedValue({ enabled: true }) },
      business: { findUniqueOrThrow: jest.fn().mockResolvedValue({ ownerId: 'owner-1' }) },
      payment: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
      transaction: { create: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
    };
    pets = { get: jest.fn() };
    notifications = { notify: jest.fn().mockResolvedValue(undefined) };
    payments = { createPayment: jest.fn(), confirmPayment: jest.fn() };
    // Zero fees/tax by default — most create() tests aren't about the checkout breakdown, so they
    // should keep seeing price === total unless a test explicitly sets a nonzero config (see
    // "create — checkout breakdown (tax/serviceFee/total)" below).
    pricingConfig = { get: jest.fn().mockResolvedValue({ serviceFeePercent: 0, serviceFeeFixed: 0, defaultTaxPercent: 0 }) };
    service = new BookingsService(
      prisma as unknown as PrismaService,
      pets as unknown as PetsService,
      notifications as unknown as NotificationService,
      payments as unknown as PaymentService,
      pricingConfig as unknown as PricingConfigService,
    );
  });

  const baseService = {
    id: 'svc-1',
    businessId: 'biz-1',
    active: true,
    price: 20,
    durationMinutes: 30,
    capacity: null,
    minAgeMonths: null,
    maxAgeMonths: null,
    species: [],
    // Wide open every day of the week, since futureDateString() lands on whatever weekday the
    // suite happens to run — these create() tests are about other validation, not opening hours
    // (that's covered separately by the "create — opening hours" describe block below).
    business: {
      id: 'biz-1',
      ownerId: 'owner-1',
      status: BusinessStatus.ACTIVE,
      membership: { status: 'ACTIVE' },
      openingHours: Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, { open: '00:00', close: '23:59' }])),
    },
  };

  const baseDto = {
    serviceId: 'svc-1',
    petId: 'pet-1',
    date: futureDateString(),
    startTime: '10:00',
    idempotencyKey: 'idem-1',
  };

  describe('create — idempotency', () => {
    it('a retried request with the same idempotencyKey returns the original booking without re-validating', async () => {
      prisma.booking.findUnique.mockResolvedValue({ id: 'existing-booking', userId: 'user-1' });
      prisma.booking.findUniqueOrThrow.mockResolvedValue({ id: 'existing-booking' });

      const result = await service.create('user-1', baseDto as any);

      expect(result).toEqual({ id: 'existing-booking' });
      expect(prisma.service.findUnique).not.toHaveBeenCalled();
    });

    it('rejects a retried key that belongs to a different customer', async () => {
      prisma.booking.findUnique.mockResolvedValue({ id: 'existing-booking', userId: 'someone-else' });
      await expect(service.create('user-1', baseDto as any)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('create — validation', () => {
    beforeEach(() => {
      prisma.booking.findUnique.mockResolvedValue(null);
    });

    it('404s on an unknown or inactive service', async () => {
      prisma.service.findUnique.mockResolvedValue(null);
      await expect(service.create('user-1', baseDto as any)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects when the business is not ACTIVE', async () => {
      prisma.service.findUnique.mockResolvedValue({ ...baseService, business: { ...baseService.business, status: BusinessStatus.SUSPENDED } });
      await expect(service.create('user-1', baseDto as any)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when the business does not have BOOKINGS enabled', async () => {
      prisma.service.findUnique.mockResolvedValue(baseService);
      prisma.businessCapability.findUnique.mockResolvedValue({ enabled: false });
      await expect(service.create('user-1', baseDto as any)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a pet whose species is not in the service species list', async () => {
      prisma.service.findUnique.mockResolvedValue({ ...baseService, species: [{ speciesId: DOG_SPECIES.id }] });
      pets.get.mockResolvedValue({ id: 'pet-1', speciesId: CAT_SPECIES.id, species: CAT_SPECIES, birthDate: null });
      await expect(service.create('user-1', baseDto as any)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts a pet whose species matches the service species list', async () => {
      prisma.service.findUnique.mockResolvedValue({ ...baseService, species: [{ speciesId: DOG_SPECIES.id }] });
      pets.get.mockResolvedValue({ id: 'pet-1', speciesId: DOG_SPECIES.id, species: DOG_SPECIES, birthDate: null });
      prisma.booking.count.mockResolvedValue(0);
      prisma.booking.create.mockResolvedValue({ id: 'new-booking', service: { name: 'Consulta' }, user: { firstName: 'Ana' } });
      await expect(service.create('user-1', baseDto as any)).resolves.toEqual(
        expect.objectContaining({ id: 'new-booking' }),
      );
    });

    it('rejects a pet younger than the service minimum age', async () => {
      const youngBirthDate = new Date();
      youngBirthDate.setMonth(youngBirthDate.getMonth() - 2); // 2 months old
      prisma.service.findUnique.mockResolvedValue({ ...baseService, minAgeMonths: 6 });
      pets.get.mockResolvedValue({ id: 'pet-1', speciesId: DOG_SPECIES.id, species: DOG_SPECIES, birthDate: youngBirthDate });
      await expect(service.create('user-1', baseDto as any)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects booking a time slot in the past', async () => {
      prisma.service.findUnique.mockResolvedValue(baseService);
      pets.get.mockResolvedValue({ id: 'pet-1', speciesId: DOG_SPECIES.id, species: DOG_SPECIES, birthDate: null });
      await expect(
        service.create('user-1', { ...baseDto, date: '2020-01-01', startTime: '10:00' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // getAvailableSlots() only ever offers times inside opening hours, but create() itself never
  // re-checked that — a client could submit any startTime, in the past or not, and only the
  // capacity/overlap check stood between it and a booking outside business hours entirely.
  describe('create — opening hours', () => {
    const monday = futureMondayDateString();

    beforeEach(() => {
      prisma.booking.findUnique.mockResolvedValue(null);
      pets.get.mockResolvedValue({ id: 'pet-1', speciesId: DOG_SPECIES.id, species: DOG_SPECIES, birthDate: null });
      prisma.booking.count.mockResolvedValue(0);
      prisma.booking.create.mockResolvedValue({ id: 'new-booking', service: { name: 'Consulta' }, user: { firstName: 'Ana' } });
    });

    it('rejects a startTime before opening', async () => {
      prisma.service.findUnique.mockResolvedValue({
        ...baseService,
        business: { ...baseService.business, openingHours: { mon: { open: '09:00', close: '17:00' } } },
      });
      await expect(
        service.create('user-1', { ...baseDto, date: monday, startTime: '08:00' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('rejects a booking that would run past closing (startTime + duration > close)', async () => {
      prisma.service.findUnique.mockResolvedValue({
        ...baseService,
        durationMinutes: 30,
        business: { ...baseService.business, openingHours: { mon: { open: '09:00', close: '17:00' } } },
      });
      await expect(
        service.create('user-1', { ...baseDto, date: monday, startTime: '16:45' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a day the business has no opening hours for at all', async () => {
      prisma.service.findUnique.mockResolvedValue({
        ...baseService,
        business: { ...baseService.business, openingHours: {} },
      });
      await expect(
        service.create('user-1', { ...baseDto, date: monday, startTime: '10:00' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts a startTime that fits cleanly inside opening hours', async () => {
      prisma.service.findUnique.mockResolvedValue({
        ...baseService,
        durationMinutes: 30,
        business: { ...baseService.business, openingHours: { mon: { open: '09:00', close: '17:00' } } },
      });
      await expect(
        service.create('user-1', { ...baseDto, date: monday, startTime: '16:30' } as any),
      ).resolves.toEqual(expect.objectContaining({ id: 'new-booking' }));
    });
  });

  describe('create — checkout breakdown (tax/serviceFee/total)', () => {
    beforeEach(() => {
      prisma.booking.findUnique.mockResolvedValue(null);
      pets.get.mockResolvedValue({ id: 'pet-1', speciesId: DOG_SPECIES.id, species: DOG_SPECIES, birthDate: null });
      prisma.booking.count.mockResolvedValue(0);
      prisma.booking.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'new-booking', ...data, service: { name: 'Baño' }, user: { firstName: 'Ana' } }),
      );
    });

    it('with a zero PricingConfiguration, freezes tax=0/serviceFee=0/total=price (unchanged checkout behavior)', async () => {
      prisma.service.findUnique.mockResolvedValue(baseService); // price: 20
      await service.create('user-1', baseDto as any);
      const data = prisma.booking.create.mock.calls[0][0].data;
      expect(Number(data.price)).toBe(20);
      expect(Number(data.tax)).toBe(0);
      expect(Number(data.serviceFee)).toBe(0);
      expect(Number(data.total)).toBe(20);
    });

    it('charges price × defaultTaxPercent for tax and the shared serviceFee formula (price × serviceFeePercent + serviceFeeFixed) for serviceFee, summed into total', async () => {
      pricingConfig.get.mockResolvedValue({ serviceFeePercent: 0.05, serviceFeeFixed: 1, defaultTaxPercent: 0.15 });
      prisma.service.findUnique.mockResolvedValue(baseService); // price: 20
      await service.create('user-1', baseDto as any);
      const data = prisma.booking.create.mock.calls[0][0].data;
      expect(Number(data.price)).toBe(20);
      expect(Number(data.tax)).toBeCloseTo(3); // 20 × 0.15
      expect(Number(data.serviceFee)).toBeCloseTo(2); // 20 × 0.05 + 1
      expect(Number(data.total)).toBeCloseTo(25); // 20 + 3 + 2
    });

    it('for a DAYCARE/BOARDING booking, computes tax/serviceFee off the already-multiplied price (service.price × billable days), never the raw per-day rate', async () => {
      pricingConfig.get.mockResolvedValue({ serviceFeePercent: 0, serviceFeeFixed: 0, defaultTaxPercent: 0.1 });
      const monday = futureMondayDateString();
      prisma.service.findUnique.mockResolvedValue({
        ...baseService,
        type: 'DAYCARE',
        price: 10,
        operatingDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
      });
      await service.create('user-1', {
        ...baseDto,
        date: monday,
        checkOutDate: addDaysToDateString(monday, 3), // mon, tue, wed → 3 billable days × $10
        startTime: undefined,
      } as any);
      const data = prisma.booking.create.mock.calls[0][0].data;
      expect(Number(data.price)).toBe(30);
      expect(Number(data.tax)).toBeCloseTo(3); // 30 × 0.1, not 10 × 0.1
      expect(Number(data.total)).toBeCloseTo(33);
    });
  });

  describe('listForBusiness — date filtering', () => {
    it('with no date/from/to, returns everything for the business (the "ver todas" case)', async () => {
      await service.listForBusiness('biz-1', {} as any);
      const where = prisma.booking.findMany.mock.calls[0][0].where;
      expect(where).toEqual({ businessId: 'biz-1' });
    });

    it('a single `date` still filters to just that day (back-compat with the old single-day agenda view)', async () => {
      await service.listForBusiness('biz-1', { date: '2026-09-22' } as any);
      const where = prisma.booking.findMany.mock.calls[0][0].where;
      expect(where.date.gte).toEqual(new Date('2026-09-22T00:00:00'));
      expect(where.date.lte).toEqual(new Date('2026-09-22T23:59:59.999'));
    });

    it('`from`/`to` filters a date range and takes priority over a stray `date`', async () => {
      await service.listForBusiness('biz-1', { date: '2026-01-01', from: '2026-09-22', to: '2026-09-30' } as any);
      const where = prisma.booking.findMany.mock.calls[0][0].where;
      expect(where.date.gte).toEqual(new Date('2026-09-22T00:00:00'));
      expect(where.date.lte).toEqual(new Date('2026-09-30T23:59:59.999'));
    });

    it('`from` alone is an open-ended "from this date onward" range — never hides a later booking just because it defaulted to today', async () => {
      await service.listForBusiness('biz-1', { from: '2026-09-22' } as any);
      const where = prisma.booking.findMany.mock.calls[0][0].where;
      expect(where.date.gte).toEqual(new Date('2026-09-22T00:00:00'));
      expect(where.date.lte).toBeUndefined();
    });
  });

  describe('create — service location (atCustomerHome)', () => {
    beforeEach(() => {
      prisma.booking.findUnique.mockResolvedValue(null);
      pets.get.mockResolvedValue({ id: 'pet-1', speciesId: DOG_SPECIES.id, species: DOG_SPECIES, birthDate: null });
      prisma.booking.count.mockResolvedValue(0);
      prisma.booking.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'new-booking', ...data, service: { name: 'X' }, user: { firstName: 'A' } }));
    });

    it('forces atCustomerHome=true for an AT_CUSTOMER_HOME service, ignoring the dto', async () => {
      prisma.service.findUnique.mockResolvedValue({ ...baseService, locationType: 'AT_CUSTOMER_HOME' });
      await service.create('user-1', { ...baseDto, atCustomerHome: false } as any);
      expect(prisma.booking.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ atCustomerHome: true }) }));
    });

    it('forces atCustomerHome=false for an AT_BUSINESS service, ignoring the dto', async () => {
      prisma.service.findUnique.mockResolvedValue({ ...baseService, locationType: 'AT_BUSINESS' });
      await service.create('user-1', { ...baseDto, atCustomerHome: true } as any);
      expect(prisma.booking.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ atCustomerHome: false }) }));
    });

    it('requires an explicit choice for a BOTH service', async () => {
      prisma.service.findUnique.mockResolvedValue({ ...baseService, locationType: 'BOTH' });
      await expect(service.create('user-1', { ...baseDto, atCustomerHome: undefined } as any)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('honors the customer\'s choice for a BOTH service', async () => {
      prisma.service.findUnique.mockResolvedValue({ ...baseService, locationType: 'BOTH' });
      await service.create('user-1', { ...baseDto, atCustomerHome: true } as any);
      expect(prisma.booking.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ atCustomerHome: true }) }));
    });
  });

  describe('create — concurrency (double booking)', () => {
    beforeEach(() => {
      prisma.booking.findUnique.mockResolvedValue(null);
      prisma.service.findUnique.mockResolvedValue(baseService);
      pets.get.mockResolvedValue({ id: 'pet-1', speciesId: DOG_SPECIES.id, species: DOG_SPECIES, birthDate: null });
    });

    it('locks the Service row before counting overlapping bookings', async () => {
      prisma.booking.count.mockResolvedValue(0);
      prisma.booking.create.mockResolvedValue({ id: 'booking-1', service: { name: 'X' }, user: { firstName: 'A' } });
      await service.create('user-1', baseDto as any);
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('rejects with BookingSlotUnavailableException when the slot is already at capacity (default capacity 1)', async () => {
      prisma.booking.count.mockResolvedValue(1); // one active booking already occupies the only slot
      await expect(service.create('user-1', baseDto as any)).rejects.toBeInstanceOf(BookingSlotUnavailableException);
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('allows a booking when count is below an explicit higher capacity', async () => {
      prisma.service.findUnique.mockResolvedValue({ ...baseService, capacity: 5 });
      prisma.booking.count.mockResolvedValue(3);
      prisma.booking.create.mockResolvedValue({ id: 'booking-2', service: { name: 'X' }, user: { firstName: 'A' } });
      await expect(service.create('user-1', baseDto as any)).resolves.toEqual(expect.objectContaining({ id: 'booking-2' }));
    });
  });

  describe('create — DAYCARE/BOARDING date-range booking', () => {
    const dayService = {
      ...baseService,
      type: 'DAYCARE',
      operatingDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
    };

    beforeEach(() => {
      prisma.booking.findUnique.mockResolvedValue(null);
      pets.get.mockResolvedValue({ id: 'pet-1', speciesId: DOG_SPECIES.id, species: DOG_SPECIES, birthDate: null });
    });

    it('rejects when checkOutDate is missing', async () => {
      prisma.service.findUnique.mockResolvedValue(dayService);
      const checkIn = futureMondayDateString();
      await expect(
        service.create('user-1', { ...baseDto, date: checkIn, startTime: undefined } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when checkOutDate is not after date', async () => {
      prisma.service.findUnique.mockResolvedValue(dayService);
      const checkIn = futureMondayDateString();
      await expect(
        service.create('user-1', { ...baseDto, date: checkIn, checkOutDate: checkIn, startTime: undefined } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a check-in date in the past', async () => {
      prisma.service.findUnique.mockResolvedValue(dayService);
      await expect(
        service.create('user-1', { ...baseDto, date: '2020-01-01', checkOutDate: '2020-01-05', startTime: undefined } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a range with no operating days in it', async () => {
      // A service that only operates Saturdays, booked Mon-Fri.
      prisma.service.findUnique.mockResolvedValue({ ...dayService, operatingDays: ['sat'] });
      const checkIn = futureMondayDateString();
      await expect(
        service.create('user-1', { ...baseDto, date: checkIn, checkOutDate: addDaysToDateString(checkIn, 5), startTime: undefined } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('only counts operating weekdays and prices per billable day, skipping the weekend', async () => {
      prisma.service.findUnique.mockResolvedValue(dayService); // Mon-Fri only, price 20
      prisma.booking.count.mockResolvedValue(0);
      prisma.booking.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...data, id: 'stay-1', service: { name: 'Guardería' }, user: { firstName: 'Ana' } }),
      );
      const checkIn = futureMondayDateString();
      const checkOut = addDaysToDateString(checkIn, 7); // Mon -> next Mon: 5 weekdays + a weekend

      const result = await service.create('user-1', {
        ...baseDto,
        date: checkIn,
        checkOutDate: checkOut,
        startTime: undefined,
      } as any);

      expect(result.billableDays).toBe(5);
      // price is now a Prisma.Decimal (frozen alongside tax/serviceFee/total — see
      // BookingsService.create), never a raw number, hence Number(...) here.
      expect(Number(result.price)).toBe(100); // 5 days * 20
    });

    it('still enforces capacity across the whole stay, same as a time slot', async () => {
      prisma.service.findUnique.mockResolvedValue({ ...dayService, capacity: 1 });
      prisma.booking.count.mockResolvedValue(1); // already one overlapping stay
      const checkIn = futureMondayDateString();
      await expect(
        service.create('user-1', {
          ...baseDto,
          date: checkIn,
          checkOutDate: addDaysToDateString(checkIn, 3),
          startTime: undefined,
        } as any),
      ).rejects.toBeInstanceOf(BookingSlotUnavailableException);
    });
  });

  describe('availability', () => {
    it('rejects checking time-of-day slots for a DAYCARE/BOARDING service — those use date ranges', async () => {
      prisma.service.findFirst.mockResolvedValue({ id: 'svc-1', type: 'DAYCARE' });
      await expect(service.getAvailableSlots('svc-1', futureDateString())).rejects.toBeInstanceOf(BadRequestException);
    });


    it('404s on an unknown service', async () => {
      prisma.service.findFirst.mockResolvedValue(null);
      await expect(service.getAvailableSlots('svc-1', futureDateString())).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns no slots when the business has no opening hours configured for that day', async () => {
      prisma.service.findFirst.mockResolvedValue({
        id: 'svc-1',
        durationMinutes: 30,
        capacity: null,
        business: { openingHours: null, status: BusinessStatus.ACTIVE, membership: { status: 'ACTIVE' } },
      });
      const slots = await service.getAvailableSlots('svc-1', futureDateString());
      expect(slots).toEqual([]);
    });

    it('generates 30-minute slots across a 09:00-11:00 window', async () => {
      const date = futureDateString();
      const weekday = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(`${date}T00:00:00`).getDay()];
      prisma.service.findFirst.mockResolvedValue({
        id: 'svc-1',
        durationMinutes: 30,
        capacity: null,
        business: { openingHours: { [weekday]: { open: '09:00', close: '11:00' } }, status: BusinessStatus.ACTIVE, membership: { status: 'ACTIVE' } },
      });
      prisma.booking.findMany.mockResolvedValue([]);
      const slots = await service.getAvailableSlots('svc-1', date);
      expect(slots).toHaveLength(4);
      expect(slots[0]).toEqual({ startTime: '09:00', endTime: '09:30' });
    });

    it('excludes a slot already at capacity', async () => {
      const date = futureDateString();
      const weekday = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(`${date}T00:00:00`).getDay()];
      const slotStart = new Date(`${date}T09:00:00`);
      const slotEnd = new Date(`${date}T09:30:00`);
      prisma.service.findFirst.mockResolvedValue({
        id: 'svc-1',
        durationMinutes: 30,
        capacity: 1,
        business: { openingHours: { [weekday]: { open: '09:00', close: '09:30' } }, status: BusinessStatus.ACTIVE, membership: { status: 'ACTIVE' } },
      });
      prisma.booking.findMany.mockResolvedValue([{ startTime: slotStart, endTime: slotEnd }]);
      const slots = await service.getAvailableSlots('svc-1', date);
      expect(slots).toEqual([]);
    });
  });

  describe('business actions — state machine', () => {
    it('confirm only succeeds from PENDING', async () => {
      prisma.booking.findUnique.mockResolvedValue({ id: 'b1', businessId: 'biz-1', status: BookingStatus.CONFIRMED });
      await expect(service.confirm('biz-1', 'b1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('complete only succeeds from CONFIRMED', async () => {
      prisma.booking.findUnique.mockResolvedValue({ id: 'b1', businessId: 'biz-1', status: BookingStatus.PENDING });
      await expect(service.complete('biz-1', 'b1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('markNoShow only succeeds from CONFIRMED', async () => {
      prisma.booking.findUnique.mockResolvedValue({ id: 'b1', businessId: 'biz-1', status: BookingStatus.PENDING });
      await expect(service.markNoShow('biz-1', 'b1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('getForBusiness 404s when the booking belongs to a different business', async () => {
      prisma.booking.findUnique.mockResolvedValue({ id: 'b1', businessId: 'other-biz' });
      await expect(service.getForBusiness('biz-1', 'b1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('cancellation', () => {
    it('customer cannot cancel a booking that already started', async () => {
      const past = new Date();
      past.setHours(past.getHours() - 1);
      prisma.booking.findUnique.mockResolvedValue({
        id: 'b1',
        userId: 'user-1',
        businessId: 'biz-1',
        status: BookingStatus.CONFIRMED,
        startTime: past,
      });
      await expect(service.cancelForCustomer('user-1', 'b1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('customer cannot cancel a completed booking', async () => {
      const future = new Date();
      future.setDate(future.getDate() + 1);
      prisma.booking.findUnique.mockResolvedValue({
        id: 'b1',
        userId: 'user-1',
        businessId: 'biz-1',
        status: BookingStatus.COMPLETED,
        startTime: future,
      });
      await expect(service.cancelForCustomer('user-1', 'b1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('getForCustomer 404s when the booking belongs to a different customer', async () => {
      prisma.booking.findUnique.mockResolvedValue({ id: 'b1', userId: 'someone-else' });
      await expect(service.getForCustomer('user-1', 'b1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createManualBlock', () => {
    const manualDto = {
      serviceId: 'svc-1',
      date: futureDateString(),
      startTime: '10:00',
      endTime: '10:30',
      reason: 'Reservado por teléfono',
    };

    it('404s when the service does not belong to this business', async () => {
      prisma.service.findUnique.mockResolvedValue({ ...baseService, businessId: 'other-biz' });
      await expect(service.createManualBlock('biz-1', manualDto as any)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404s on an unknown service', async () => {
      prisma.service.findUnique.mockResolvedValue(null);
      await expect(service.createManualBlock('biz-1', manualDto as any)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a manual block on an inactive service', async () => {
      prisma.service.findUnique.mockResolvedValue({ ...baseService, active: false });
      await expect(service.createManualBlock('biz-1', manualDto as any)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('requires startTime and endTime for a time-slot service', async () => {
      prisma.service.findUnique.mockResolvedValue(baseService);
      await expect(
        service.createManualBlock('biz-1', { ...manualDto, startTime: undefined, endTime: undefined } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects endTime at or before startTime — not constrained to the duration grid, but must be a real interval', async () => {
      prisma.service.findUnique.mockResolvedValue(baseService);
      await expect(
        service.createManualBlock('biz-1', { ...manualDto, startTime: '10:30', endTime: '10:30' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates a CONFIRMED, MANUAL-sourced booking with no customer/price, holding capacity', async () => {
      prisma.service.findUnique.mockResolvedValue(baseService);
      prisma.booking.count.mockResolvedValue(0);
      prisma.booking.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'block-1', ...data, service: { name: 'X' } }));

      const result = await service.createManualBlock('biz-1', manualDto as any);

      expect(prisma.booking.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: null,
            petId: null,
            price: 0,
            status: BookingStatus.CONFIRMED,
            source: 'MANUAL',
            notes: 'Reservado por teléfono',
          }),
        }),
      );
      expect(result).toEqual(expect.objectContaining({ id: 'block-1' }));
    });

    it('is not constrained to business opening hours — an off-platform entry can be logged at any time', async () => {
      prisma.service.findUnique.mockResolvedValue({
        ...baseService,
        business: { ...baseService.business, openingHours: { mon: { open: '09:00', close: '17:00' } } },
      });
      prisma.booking.count.mockResolvedValue(0);
      prisma.booking.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'block-2', ...data, service: { name: 'X' } }));
      await expect(
        service.createManualBlock('biz-1', { ...manualDto, startTime: '20:00', endTime: '20:30' } as any),
      ).resolves.toEqual(expect.objectContaining({ id: 'block-2' }));
    });

    it('rejects with BookingSlotUnavailableException once the service is already at capacity', async () => {
      prisma.service.findUnique.mockResolvedValue(baseService); // default capacity 1
      prisma.booking.count.mockResolvedValue(1);
      await expect(service.createManualBlock('biz-1', manualDto as any)).rejects.toBeInstanceOf(BookingSlotUnavailableException);
      expect(prisma.booking.create).not.toHaveBeenCalled();
    });

    it('locks the Service row before counting, same discipline as create()', async () => {
      prisma.service.findUnique.mockResolvedValue(baseService);
      prisma.booking.count.mockResolvedValue(0);
      prisma.booking.create.mockResolvedValue({ id: 'block-3', service: { name: 'X' } });
      await service.createManualBlock('biz-1', manualDto as any);
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    describe('DAYCARE/BOARDING manual block', () => {
      const dayService = { ...baseService, type: 'DAYCARE', operatingDays: ['mon', 'tue', 'wed', 'thu', 'fri'] };

      it('requires checkOutDate', async () => {
        prisma.service.findUnique.mockResolvedValue(dayService);
        await expect(
          service.createManualBlock('biz-1', { serviceId: 'svc-1', date: futureMondayDateString() } as any),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('computes billableDays from operatingDays over the range, same as an app booking', async () => {
        prisma.service.findUnique.mockResolvedValue(dayService);
        prisma.booking.count.mockResolvedValue(0);
        prisma.booking.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'block-4', ...data, service: { name: 'Guardería' } }));
        const checkIn = futureMondayDateString();
        const result = await service.createManualBlock('biz-1', {
          serviceId: 'svc-1',
          date: checkIn,
          checkOutDate: addDaysToDateString(checkIn, 7),
        } as any);
        expect((result as any).billableDays).toBe(5);
        expect((result as any).price).toBe(0);
      });
    });
  });

  describe('manual block and app booking compete for the same capacity', () => {
    it('create() is rejected when an existing MANUAL block already fills the service\'s capacity', async () => {
      // count() doesn't distinguish source — a MANUAL row is counted exactly like an APP row, so an
      // existing manual block genuinely blocks a new app booking through the same query.
      prisma.booking.findUnique.mockResolvedValue(null);
      prisma.service.findUnique.mockResolvedValue(baseService); // capacity 1
      pets.get.mockResolvedValue({ id: 'pet-1', speciesId: DOG_SPECIES.id, species: DOG_SPECIES, birthDate: null });
      prisma.booking.count.mockResolvedValue(1); // the one slot is already held by a manual block
      await expect(service.create('user-1', baseDto as any)).rejects.toBeInstanceOf(BookingSlotUnavailableException);
    });

    it('createManualBlock() is rejected when an existing APP booking already fills the service\'s capacity', async () => {
      prisma.service.findUnique.mockResolvedValue(baseService); // capacity 1
      prisma.booking.count.mockResolvedValue(1); // the one slot is already held by an app booking
      await expect(
        service.createManualBlock('biz-1', {
          serviceId: 'svc-1',
          date: futureDateString(),
          startTime: '10:00',
          endTime: '10:30',
        } as any),
      ).rejects.toBeInstanceOf(BookingSlotUnavailableException);
    });
  });

  describe('business actions on a MANUAL block', () => {
    const manualBooking = {
      id: 'block-1',
      businessId: 'biz-1',
      status: BookingStatus.CONFIRMED,
      source: 'MANUAL',
      userId: null,
      startTime: new Date(),
      user: null,
      service: { name: 'X' },
      business: { tradeName: 'Negocio' },
      notes: null,
    };

    it('confirm rejects a MANUAL block — it is already confirmed by definition', async () => {
      prisma.booking.findUnique.mockResolvedValue(manualBooking);
      await expect(service.confirm('biz-1', 'block-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('complete rejects a MANUAL block', async () => {
      prisma.booking.findUnique.mockResolvedValue(manualBooking);
      await expect(service.complete('biz-1', 'block-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('markNoShow rejects a MANUAL block', async () => {
      prisma.booking.findUnique.mockResolvedValue(manualBooking);
      await expect(service.markNoShow('biz-1', 'block-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('cancelForBusiness cancels a MANUAL block without notifying any customer', async () => {
      const past = new Date();
      past.setHours(past.getHours() - 3);
      prisma.booking.findUnique.mockResolvedValue({ ...manualBooking, startTime: past });
      prisma.booking.update.mockResolvedValue({ ...manualBooking, startTime: past, status: BookingStatus.CANCELLED });
      const result = await service.cancelForBusiness('biz-1', 'block-1');
      expect(result.status).toBe(BookingStatus.CANCELLED);
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('cancelForBusiness allows cancelling a MANUAL block even after its start time has passed', async () => {
      const past = new Date();
      past.setHours(past.getHours() - 3);
      prisma.booking.findUnique.mockResolvedValue({ ...manualBooking, startTime: past });
      prisma.booking.update.mockResolvedValue({ ...manualBooking, startTime: past, status: BookingStatus.CANCELLED });
      await expect(service.cancelForBusiness('biz-1', 'block-1')).resolves.toEqual(expect.objectContaining({ status: BookingStatus.CANCELLED }));
    });
  });

  describe('getCalendar', () => {
    const weekFrom = futureMondayDateString();

    it('rejects a `to` before `from`', async () => {
      await expect(service.getCalendar('biz-1', { from: weekFrom, to: addDaysToDateString(weekFrom, -1) } as any)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects a range spanning more than 31 days', async () => {
      await expect(
        service.getCalendar('biz-1', { from: weekFrom, to: addDaysToDateString(weekFrom, 40) } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404s when filtering to a serviceId this business does not have', async () => {
      prisma.service.findMany = jest.fn().mockResolvedValue([]);
      await expect(
        service.getCalendar('biz-1', { from: weekFrom, to: addDaysToDateString(weekFrom, 6), serviceId: 'ghost' } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns a slot-capacity grid plus the raw bookings/blocks for a time-slot service', async () => {
      prisma.service.findMany = jest.fn().mockResolvedValue([
        {
          id: 'svc-1',
          type: 'GROOMING',
          durationMinutes: 30,
          capacity: 2,
          operatingDays: [],
          business: { openingHours: { [WEEKDAY_KEYS_LOCAL[new Date(`${weekFrom}T00:00:00`).getDay()]]: { open: '09:00', close: '10:00' } } },
        },
      ]);
      prisma.booking.findMany = jest.fn().mockResolvedValue([
        {
          id: 'b1',
          serviceId: 'svc-1',
          source: 'APP',
          status: BookingStatus.CONFIRMED,
          startTime: new Date(`${weekFrom}T09:00:00`),
          endTime: new Date(`${weekFrom}T09:30:00`),
          notes: null,
          atCustomerHome: false,
          user: { firstName: 'Ana', lastName: 'P' },
          pet: { name: 'Firulais' },
          service: { name: 'Grooming' },
        },
      ]);

      const result = await service.getCalendar('biz-1', { from: weekFrom, to: weekFrom } as any);

      expect(result.bookings).toHaveLength(1);
      expect(result.bookings[0]).toEqual(expect.objectContaining({ id: 'b1', customerName: 'Ana P', petName: 'Firulais' }));
      // 09:00-10:00 in 30-min steps = 2 slots, each showing capacity 2 with 1 occupied by the booking above.
      expect(result.slots).toHaveLength(2);
      expect(result.slots[0]).toEqual({ serviceId: 'svc-1', date: weekFrom, startTime: '09:00', endTime: '09:30', capacity: 2, occupied: 1, remaining: 1 });
      expect(result.slots[1]).toEqual({ serviceId: 'svc-1', date: weekFrom, startTime: '09:30', endTime: '10:00', capacity: 2, occupied: 0, remaining: 2 });
    });

    it('includes COMPLETED bookings in the query — a completed booking must keep showing (and counting as occupied) in the calendar, not vanish once marked done', async () => {
      prisma.service.findMany = jest.fn().mockResolvedValue([
        { id: 'svc-1', type: 'GROOMING', durationMinutes: 30, capacity: 2, operatingDays: [], business: { openingHours: {} } },
      ]);
      prisma.booking.findMany = jest.fn().mockResolvedValue([]);

      await service.getCalendar('biz-1', { from: weekFrom, to: weekFrom } as any);

      const statusFilter = prisma.booking.findMany.mock.calls[0][0].where.status.in;
      expect(statusFilter).toEqual(expect.arrayContaining([BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.COMPLETED]));
      expect(statusFilter).not.toContain(BookingStatus.CANCELLED);
      expect(statusFilter).not.toContain(BookingStatus.NO_SHOW);
    });

    it('collapses a DAYCARE/BOARDING service to one whole-day slot per operating day', async () => {
      prisma.service.findMany = jest.fn().mockResolvedValue([
        { id: 'svc-2', type: 'DAYCARE', durationMinutes: 60, capacity: 3, operatingDays: ['mon'], business: { openingHours: {} } },
      ]);
      prisma.booking.findMany = jest.fn().mockResolvedValue([]);

      const result = await service.getCalendar('biz-1', { from: weekFrom, to: addDaysToDateString(weekFrom, 1) } as any);

      expect(result.slots).toEqual([
        { serviceId: 'svc-2', date: weekFrom, startTime: '00:00', endTime: '24:00', capacity: 3, occupied: 0, remaining: 3 },
      ]);
    });
  });

  describe('admin — global read-only supervision', () => {
    it('getForAdmin 404s on an unknown booking', async () => {
      prisma.booking.findUnique.mockResolvedValue(null);
      await expect(service.getForAdmin('ghost')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('listForAdmin returns bookings across every business', async () => {
      prisma.booking.count.mockResolvedValue(1);
      prisma.booking.findMany.mockResolvedValue([{ id: 'b1' }]);
      const result = await service.listForAdmin({});
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  // Card checkout now only opens up once the business has confirmed the booking — payment no
  // longer drives confirmation the other way (that used to happen inside syncFromPaymentStatus).
  // Cash reuses the exact same Payment row/relation, distinguished only by `provider: 'CASH'`,
  // and is settled directly by the business rather than through PaymentService.
  describe('booking payment — card and cash', () => {
    const confirmedCustomerBooking = {
      id: 'b1',
      userId: 'user-1',
      businessId: 'biz-1',
      status: BookingStatus.CONFIRMED,
      price: 50,
      // Simulates a booking whose tax/serviceFee were frozen at creation time (see
      // BookingsService.create) — total = 50 + 5 tax + 2 serviceFee = 57. The card checkout must
      // charge this, never `price` alone; the cash flow (see chooseCashPayment tests below) still
      // charges just `price`.
      tax: 5,
      serviceFee: 2,
      total: 57,
      payment: null as any,
      service: { name: 'Baño' },
      business: { tradeName: 'Negocio X' },
      user: { firstName: 'Ana' },
    };

    const confirmedBusinessBooking = {
      id: 'b1',
      userId: 'user-1',
      businessId: 'biz-1',
      status: BookingStatus.CONFIRMED,
      price: 50,
      payment: null as any,
      service: { name: 'Baño' },
      business: { tradeName: 'Negocio X' },
      user: { firstName: 'Ana' },
    };

    describe('createBookingPayment (card)', () => {
      it('rejects paying by card before the business has confirmed the booking', async () => {
        prisma.booking.findUnique.mockResolvedValue({ ...confirmedCustomerBooking, status: BookingStatus.PENDING });
        await expect(service.createBookingPayment('user-1', 'b1', 'idem-1')).rejects.toBeInstanceOf(BadRequestException);
        expect(payments.createPayment).not.toHaveBeenCalled();
      });

      it('creates a card payment for price + tax + serviceFee (booking.total), never price alone, once the booking is CONFIRMED', async () => {
        prisma.booking.findUnique.mockResolvedValue(confirmedCustomerBooking);
        payments.createPayment.mockResolvedValue({ id: 'pay-1', provider: 'sandbox', status: PaymentStatus.PENDING });
        const result = await service.createBookingPayment('user-1', 'b1', 'idem-1');
        expect(payments.createPayment).toHaveBeenCalledWith(prisma, { bookingId: 'b1' }, 57, 'USD', 'idem-1');
        expect(result).toEqual(expect.objectContaining({ id: 'pay-1' }));
      });

      it('a retried call returns the existing card payment instead of creating a second one', async () => {
        const existing = { id: 'pay-1', provider: 'sandbox', status: PaymentStatus.PENDING };
        prisma.booking.findUnique.mockResolvedValue({ ...confirmedCustomerBooking, payment: existing });
        const result = await service.createBookingPayment('user-1', 'b1', 'idem-2');
        expect(result).toBe(existing);
        expect(payments.createPayment).not.toHaveBeenCalled();
      });

      it('rejects paying by card once the customer already chose cash', async () => {
        prisma.booking.findUnique.mockResolvedValue({
          ...confirmedCustomerBooking,
          payment: { id: 'pay-2', provider: 'CASH', status: PaymentStatus.PENDING },
        });
        await expect(service.createBookingPayment('user-1', 'b1', 'idem-1')).rejects.toBeInstanceOf(BadRequestException);
      });
    });

    describe('confirmBookingPayment (card)', () => {
      it('rejects confirming online for a cash-chosen booking', async () => {
        prisma.booking.findUnique.mockResolvedValue({
          ...confirmedCustomerBooking,
          payment: { id: 'pay-2', provider: 'CASH', status: PaymentStatus.PENDING },
        });
        await expect(service.confirmBookingPayment('user-1', 'b1')).rejects.toBeInstanceOf(BadRequestException);
        expect(payments.confirmPayment).not.toHaveBeenCalled();
      });

      it('marks a card payment PAID without re-confirming an already-confirmed booking', async () => {
        const cardPayment = { id: 'pay-1', provider: 'sandbox', status: PaymentStatus.PENDING };
        prisma.booking.findUnique.mockResolvedValue({ ...confirmedCustomerBooking, payment: cardPayment });
        payments.confirmPayment.mockResolvedValue({ id: 'pay-1', status: PaymentStatus.PAID });
        await service.confirmBookingPayment('user-1', 'b1');
        expect(payments.confirmPayment).toHaveBeenCalledWith('pay-1', 'success');
        // Booking.status is never written here — confirmation already happened earlier, by the
        // business, independently; a successful card payment only ever updates the Payment row.
        expect(prisma.booking.update).not.toHaveBeenCalled();
      });
    });

    describe('chooseCashPayment', () => {
      it('rejects before the business has confirmed the booking', async () => {
        prisma.booking.findUnique.mockResolvedValue({ ...confirmedCustomerBooking, status: BookingStatus.PENDING });
        await expect(service.chooseCashPayment('user-1', 'b1')).rejects.toBeInstanceOf(BadRequestException);
      });

      it('creates a PENDING cash Payment and notifies the business it must collect payment before the service starts', async () => {
        prisma.booking.findUnique.mockResolvedValue(confirmedCustomerBooking);
        prisma.payment.create.mockResolvedValue({ id: 'pay-2', provider: 'CASH', status: PaymentStatus.PENDING, amount: 50 });
        const result = await service.chooseCashPayment('user-1', 'b1');
        expect(prisma.payment.create).toHaveBeenCalledWith({
          data: { bookingId: 'b1', provider: 'CASH', amount: 50, currency: 'USD', status: PaymentStatus.PENDING },
        });
        expect(result).toEqual(expect.objectContaining({ provider: 'CASH' }));
        expect(notifications.notify).toHaveBeenCalledWith(
          expect.objectContaining({ event: 'booking.cash_payment_pending', userId: 'owner-1' }),
        );
      });

      it('a retried choice returns the existing cash payment idempotently', async () => {
        const existing = { id: 'pay-2', provider: 'CASH', status: PaymentStatus.PENDING };
        prisma.booking.findUnique.mockResolvedValue({ ...confirmedCustomerBooking, payment: existing });
        const result = await service.chooseCashPayment('user-1', 'b1');
        expect(result).toBe(existing);
        expect(prisma.payment.create).not.toHaveBeenCalled();
      });

      it('rejects choosing cash once the customer already chose card', async () => {
        prisma.booking.findUnique.mockResolvedValue({
          ...confirmedCustomerBooking,
          payment: { id: 'pay-1', provider: 'sandbox', status: PaymentStatus.PENDING },
        });
        await expect(service.chooseCashPayment('user-1', 'b1')).rejects.toBeInstanceOf(BadRequestException);
      });
    });

    describe('markCashPaid', () => {
      it('rejects when there is no cash payment pending for this booking', async () => {
        prisma.booking.findUnique.mockResolvedValue({ ...confirmedBusinessBooking, payment: null });
        await expect(service.markCashPaid('biz-1', 'b1')).rejects.toBeInstanceOf(BadRequestException);
      });

      it('rejects when the booking payment is a card payment, not cash', async () => {
        prisma.booking.findUnique.mockResolvedValue({
          ...confirmedBusinessBooking,
          payment: { id: 'pay-1', provider: 'sandbox', status: PaymentStatus.PENDING },
        });
        await expect(service.markCashPaid('biz-1', 'b1')).rejects.toBeInstanceOf(BadRequestException);
      });

      it('marks the cash Payment PAID, records a Transaction, and notifies the customer — without touching Booking.status', async () => {
        const cashPayment = { id: 'pay-2', provider: 'CASH', status: PaymentStatus.PENDING, amount: 50 };
        prisma.booking.findUnique.mockResolvedValue({ ...confirmedBusinessBooking, payment: cashPayment });
        await service.markCashPaid('biz-1', 'b1');
        expect(prisma.payment.update).toHaveBeenCalledWith({ where: { id: 'pay-2' }, data: { status: PaymentStatus.PAID } });
        expect(prisma.transaction.create).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ paymentId: 'pay-2', status: PaymentStatus.PAID }) }),
        );
        expect(prisma.booking.update).not.toHaveBeenCalled();
        expect(notifications.notify).toHaveBeenCalledWith(
          expect.objectContaining({ event: 'booking.payment_received', userId: 'user-1' }),
        );
      });

      it('is idempotent once already PAID', async () => {
        const cashPayment = { id: 'pay-2', provider: 'CASH', status: PaymentStatus.PAID, amount: 50 };
        prisma.booking.findUnique.mockResolvedValue({ ...confirmedBusinessBooking, payment: cashPayment });
        await service.markCashPaid('biz-1', 'b1');
        expect(prisma.payment.update).not.toHaveBeenCalled();
      });
    });

    describe('syncFromPaymentStatus', () => {
      it("no longer confirms a still-PENDING booking on a successful payment — confirmation is the business's own separate action", async () => {
        prisma.booking.findUnique.mockResolvedValue({
          id: 'b1',
          userId: 'user-1',
          businessId: 'biz-1',
          status: BookingStatus.PENDING,
          service: { name: 'Baño' },
        });
        await service.syncFromPaymentStatus('b1', PaymentStatus.PAID);
        expect(prisma.booking.update).not.toHaveBeenCalled();
        expect(notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'booking.payment_received' }));
      });

      it('still notifies the customer of a failed payment, unchanged', async () => {
        prisma.booking.findUnique.mockResolvedValue({
          id: 'b1',
          userId: 'user-1',
          businessId: 'biz-1',
          status: BookingStatus.CONFIRMED,
          service: { name: 'Baño' },
        });
        await service.syncFromPaymentStatus('b1', PaymentStatus.FAILED);
        expect(notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ event: 'booking.payment_failed' }));
      });
    });
  });
});
