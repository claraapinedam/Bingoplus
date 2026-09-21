import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BookingStatus, BusinessStatus } from '@prisma/client';
import { BookingsService } from './bookings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PetsService } from '../pets/pets.service';
import { NotificationService } from '../notifications/notification.service';
import { PaymentService } from '../payments/payment.service';
import { BookingSlotUnavailableException } from '../../common/exceptions/booking-slot-unavailable.exception';

const DOG_SPECIES = { id: 'species-dog', slug: 'dog', name: 'Perro' };
const CAT_SPECIES = { id: 'species-cat', slug: 'cat', name: 'Gato' };

function futureDateString(daysAhead = 30): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

/** A Monday at least 30 days out, regardless of what day the suite happens to run on — needed to
 * deterministically test operatingDays weekday filtering. */
function futureMondayDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  const diffToMonday = (8 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}

function addDaysToDateString(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

describe('BookingsService', () => {
  let service: BookingsService;
  let prisma: any;
  let pets: any;
  let notifications: any;
  let payments: any;

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
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
    };
    pets = { get: jest.fn() };
    notifications = { notify: jest.fn().mockResolvedValue(undefined) };
    payments = { createPayment: jest.fn(), confirmPayment: jest.fn() };
    service = new BookingsService(
      prisma as unknown as PrismaService,
      pets as unknown as PetsService,
      notifications as unknown as NotificationService,
      payments as unknown as PaymentService,
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
    business: { id: 'biz-1', ownerId: 'owner-1', status: BusinessStatus.ACTIVE },
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
      expect(result.price).toBe(100); // 5 days * 20
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
        business: { openingHours: null, status: BusinessStatus.ACTIVE },
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
        business: { openingHours: { [weekday]: { open: '09:00', close: '11:00' } }, status: BusinessStatus.ACTIVE },
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
        business: { openingHours: { [weekday]: { open: '09:00', close: '09:30' } }, status: BusinessStatus.ACTIVE },
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
});
