import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, BusinessCapabilityType, BusinessStatus, PaymentStatus, Prisma } from '@prisma/client';
import { resolvePagination } from '@bingoplus/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { PetsService } from '../pets/pets.service';
import { NotificationService } from '../notifications/notification.service';
import { PaymentService } from '../payments/payment.service';
import { BookingSlotUnavailableException } from '../../common/exceptions/booking-slot-unavailable.exception';
import { DEFAULT_SERVICE_CAPACITY } from '../services/services.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ListAdminBookingsQueryDto, ListBusinessBookingsQueryDto, ListCustomerBookingsQueryDto } from './dto/list-bookings-query.dto';

const ACTIVE_STATUSES: BookingStatus[] = [BookingStatus.PENDING, BookingStatus.CONFIRMED];

// Same weekday-indexing convention as getOpeningStatus() in @bingoplus/utils (Business.openingHours
// keys), kept as a local copy since that helper's WEEKDAY_KEYS isn't exported — both read the exact
// same JSON shape and must stay in sync if that shape ever changes.
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const BOOKING_INCLUDE = {
  service: true,
  pet: { include: { species: true } },
  business: { select: { id: true, tradeName: true, city: true, addressLine: true, logoUrl: true, phone: true } },
  user: { select: { id: true, firstName: true, lastName: true, phone: true } },
} satisfies Prisma.BookingInclude;

function minutesToHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pets: PetsService,
    private readonly notifications: NotificationService,
    private readonly payments: PaymentService,
  ) {}

  // ── Availability — computed live from Business.openingHours + Service.durationMinutes +
  // existing Bookings, never stored/cached, so it's always correct (§9/10). ──────────────────

  async getAvailableSlots(serviceId: string, dateStr: string) {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, active: true },
      include: { business: { select: { openingHours: true, status: true } } },
    });
    if (!service) throw new NotFoundException('Service not found');
    if (service.business.status !== BusinessStatus.ACTIVE) return [];

    const dayStart = new Date(`${dateStr}T00:00:00`);
    const hours = (service.business.openingHours as Record<string, { open?: string; close?: string }> | null)?.[
      WEEKDAY_KEYS[dayStart.getDay()]
    ];
    if (!hours?.open || !hours?.close) return [];

    const [openH, openM] = hours.open.split(':').map(Number);
    const [closeH, closeM] = hours.close.split(':').map(Number);
    const dayStartMinutes = openH * 60 + openM;
    const dayEndMinutes = closeH * 60 + closeM;
    const duration = service.durationMinutes;
    const capacity = service.capacity ?? DEFAULT_SERVICE_CAPACITY;

    const candidates: { startTime: string; endTime: string; start: Date; end: Date }[] = [];
    for (let m = dayStartMinutes; m + duration <= dayEndMinutes; m += duration) {
      const start = new Date(dayStart);
      start.setHours(0, m, 0, 0);
      const end = new Date(start.getTime() + duration * 60000);
      candidates.push({ startTime: minutesToHHMM(m), endTime: minutesToHHMM(m + duration), start, end });
    }
    if (candidates.length === 0) return [];

    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60000 - 1);
    const bookings = await this.prisma.booking.findMany({
      where: { serviceId, status: { in: ACTIVE_STATUSES }, startTime: { gte: dayStart, lte: dayEnd } },
      select: { startTime: true, endTime: true },
    });

    const now = new Date();
    return candidates
      .filter((c) => c.start.getTime() > now.getTime())
      .filter((c) => {
        const overlapping = bookings.filter((b) => b.startTime < c.end && b.endTime > c.start).length;
        return overlapping < capacity;
      })
      .map(({ startTime, endTime }) => ({ startTime, endTime }));
  }

  // ── Customer-facing ───────────────────────────────────────────────────────

  async listForCustomer(userId: string, query: ListCustomerBookingsQueryDto) {
    return this.prisma.booking.findMany({
      where: { userId, ...(query.status ? { status: query.status } : {}) },
      orderBy: { startTime: 'desc' },
      include: BOOKING_INCLUDE,
    });
  }

  async getForCustomer(userId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, include: BOOKING_INCLUDE });
    if (!booking || booking.userId !== userId) throw new NotFoundException('Booking not found');
    return booking;
  }

  /**
   * §11/37: the whole create flow — idempotency check first (before any validation, so a retried
   * double-tap short-circuits to the original booking even if the slot has since filled up),
   * then a `$transaction` that row-locks the Service (`SELECT ... FOR UPDATE`) before counting
   * overlapping active bookings against capacity. The lock serializes concurrent attempts at the
   * same service, so only one can pass the capacity check for a given slot — no read-then-write
   * race window, same discipline as StockService.reserveStock's conditional UPDATE (there's no
   * "quantity" column here to decrement, so a row lock is the equivalent guard).
   */
  async create(userId: string, dto: CreateBookingDto) {
    const existing = await this.prisma.booking.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
    if (existing) {
      if (existing.userId !== userId) throw new ForbiddenException('Not your booking');
      return this.prisma.booking.findUniqueOrThrow({ where: { id: existing.id }, include: BOOKING_INCLUDE });
    }

    const service = await this.prisma.service.findUnique({
      where: { id: dto.serviceId },
      include: { species: { include: { species: true } }, business: true },
    });
    if (!service || !service.active) throw new NotFoundException('Service not found');
    if (service.business.status !== BusinessStatus.ACTIVE) {
      throw new BadRequestException('This business is not currently accepting bookings');
    }
    const bookingsEnabled = await this.prisma.businessCapability.findUnique({
      where: { businessId_capability: { businessId: service.businessId, capability: BusinessCapabilityType.BOOKINGS } },
    });
    if (!bookingsEnabled?.enabled) {
      throw new BadRequestException('This business does not accept online bookings');
    }

    const pet = await this.pets.get(userId, dto.petId);
    if (service.species.length > 0 && !service.species.some((s) => s.speciesId === pet.speciesId)) {
      throw new BadRequestException(`This service does not apply to ${pet.species.name}`);
    }
    if (pet.birthDate) {
      const ageMonths = monthsBetween(new Date(pet.birthDate), new Date());
      if (service.minAgeMonths != null && ageMonths < service.minAgeMonths) {
        throw new BadRequestException('This pet does not meet the minimum age for this service');
      }
      if (service.maxAgeMonths != null && ageMonths > service.maxAgeMonths) {
        throw new BadRequestException('This pet exceeds the maximum age for this service');
      }
    }

    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(dto.startTime)) {
      throw new BadRequestException('Invalid startTime');
    }
    const [h, m] = dto.startTime.split(':').map(Number);
    const bookingDate = new Date(`${dto.date}T00:00:00`);
    const startTime = new Date(bookingDate);
    startTime.setHours(h, m, 0, 0);
    const endTime = new Date(startTime.getTime() + service.durationMinutes * 60000);
    if (startTime.getTime() <= Date.now()) {
      throw new BadRequestException('Cannot book a time slot in the past');
    }

    const booking = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Service" WHERE id = ${service.id} FOR UPDATE`;
      const overlapping = await tx.booking.count({
        where: {
          serviceId: service.id,
          status: { in: ACTIVE_STATUSES },
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
      });
      const capacity = service.capacity ?? DEFAULT_SERVICE_CAPACITY;
      if (overlapping >= capacity) throw new BookingSlotUnavailableException();

      return tx.booking.create({
        data: {
          userId,
          petId: pet.id,
          businessId: service.businessId,
          serviceId: service.id,
          date: bookingDate,
          startTime,
          endTime,
          price: service.price,
          notes: dto.notes,
          idempotencyKey: dto.idempotencyKey,
          status: BookingStatus.PENDING,
        },
        include: BOOKING_INCLUDE,
      });
    });

    void this.notifications.notify({
      userId,
      event: 'booking.created',
      title: 'Reserva creada',
      body: `Tu reserva de "${booking.service.name}" quedó pendiente de confirmación.`,
      data: { bookingId: booking.id },
    });
    void this.notifications.notify({
      userId: service.business.ownerId,
      event: 'booking.new',
      title: 'Nueva reserva',
      body: `${booking.user.firstName} reservó "${booking.service.name}".`,
      data: { bookingId: booking.id },
    });

    return booking;
  }

  async cancelForCustomer(userId: string, bookingId: string, reason?: string) {
    const booking = await this.getForCustomer(userId, bookingId);
    this.assertCancellable(booking);
    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.CANCELLED, notes: reason ? `${booking.notes ?? ''}\n[Cancelado por cliente] ${reason}`.trim() : booking.notes },
      include: BOOKING_INCLUDE,
    });
    const ownerId = await this.getBusinessOwnerId(updated.businessId);
    void this.notifications.notify({
      userId: ownerId,
      event: 'booking.cancelled',
      title: 'Reserva cancelada',
      body: `${updated.user.firstName} canceló su reserva de "${updated.service.name}".`,
      data: { bookingId: updated.id },
    });
    return updated;
  }

  // ── Booking payment (§1) — reuses PaymentService exactly as CheckoutService does for Orders;
  // confirmation reuses the existing confirm() business method rather than duplicating its
  // PENDING-check/notification logic, so there is still only one place a booking becomes
  // CONFIRMED. ──────────────────────────────────────────────────────────────

  async createBookingPayment(userId: string, bookingId: string, idempotencyKey: string) {
    const booking = await this.getForCustomer(userId, bookingId);
    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException('Only a pending booking can be paid online');
    }
    return this.prisma.$transaction((tx) =>
      this.payments.createPayment(tx, { bookingId: booking.id }, booking.price, 'USD', idempotencyKey),
    );
  }

  async getBookingPayment(userId: string, bookingId: string) {
    const booking = await this.getForCustomer(userId, bookingId);
    const payment = await this.prisma.payment.findUnique({
      where: { bookingId: booking.id },
      include: { transactions: true, refunds: true },
    });
    if (!payment) throw new NotFoundException('No payment found for this booking');
    return payment;
  }

  async confirmBookingPayment(userId: string, bookingId: string, simulateFailure?: boolean) {
    const booking = await this.getForCustomer(userId, bookingId);
    const payment = await this.prisma.payment.findUnique({ where: { bookingId: booking.id } });
    if (!payment) throw new NotFoundException('No payment found for this booking');
    if (payment.status === PaymentStatus.PAID) {
      return { payment, booking };
    }
    const result = await this.payments.confirmPayment(payment.id, simulateFailure ? 'failure' : 'success');
    await this.syncFromPaymentStatus(booking.id, result.status);
    return { payment: result, booking: await this.getForCustomer(userId, booking.id) };
  }

  /** Entry point for both the direct-confirm path and the webhook path (mirrors
   * CheckoutService.syncOrderFromPaymentStatus). A failed payment deliberately leaves the booking
   * PENDING — no auto-cancellation rule exists in the spec for this, and inventing one here would
   * be exactly the "no inventar reglas financieras" violation the phase forbids. */
  async syncFromPaymentStatus(bookingId: string, paymentStatus: PaymentStatus) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) return;
    if (paymentStatus === PaymentStatus.PAID && booking.status === BookingStatus.PENDING) {
      await this.confirm(booking.businessId, booking.id);
    } else if (paymentStatus === PaymentStatus.FAILED) {
      void this.notifications.notify({
        userId: booking.userId,
        event: 'booking.payment_failed',
        title: 'Pago no procesado',
        body: 'No pudimos procesar el pago de tu reserva. Puedes intentarlo de nuevo.',
        data: { bookingId: booking.id },
      });
    }
  }

  // ── Business-facing ───────────────────────────────────────────────────────

  async listForBusiness(businessId: string, query: ListBusinessBookingsQueryDto) {
    const where: Prisma.BookingWhereInput = {
      businessId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.date
        ? {
            date: {
              gte: new Date(`${query.date}T00:00:00`),
              lte: new Date(`${query.date}T23:59:59.999`),
            },
          }
        : {}),
    };
    return this.prisma.booking.findMany({ where, orderBy: { startTime: 'asc' }, include: BOOKING_INCLUDE });
  }

  async getForBusiness(businessId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, include: BOOKING_INCLUDE });
    if (!booking || booking.businessId !== businessId) throw new NotFoundException('Booking not found');
    return booking;
  }

  async confirm(businessId: string, bookingId: string) {
    const booking = await this.getForBusiness(businessId, bookingId);
    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException('Only pending bookings can be confirmed');
    }
    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.CONFIRMED },
      include: BOOKING_INCLUDE,
    });
    void this.notifications.notify({
      userId: updated.userId,
      event: 'booking.confirmed',
      title: 'Reserva confirmada',
      body: `${updated.business.tradeName} confirmó tu reserva de "${updated.service.name}".`,
      data: { bookingId: updated.id },
    });
    return updated;
  }

  async cancelForBusiness(businessId: string, bookingId: string, reason?: string) {
    const booking = await this.getForBusiness(businessId, bookingId);
    this.assertCancellable(booking);
    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.CANCELLED, notes: reason ? `${booking.notes ?? ''}\n[Cancelado por negocio] ${reason}`.trim() : booking.notes },
      include: BOOKING_INCLUDE,
    });
    void this.notifications.notify({
      userId: updated.userId,
      event: 'booking.cancelled',
      title: 'Reserva cancelada',
      body: `${updated.business.tradeName} canceló tu reserva de "${updated.service.name}".`,
      data: { bookingId: updated.id },
    });
    return updated;
  }

  async complete(businessId: string, bookingId: string) {
    const booking = await this.getForBusiness(businessId, bookingId);
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('Only confirmed bookings can be completed');
    }
    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.COMPLETED },
      include: BOOKING_INCLUDE,
    });
    void this.notifications.notify({
      userId: updated.userId,
      event: 'booking.completed',
      title: 'Reserva completada',
      body: `Tu reserva de "${updated.service.name}" fue completada.`,
      data: { bookingId: updated.id },
    });
    return updated;
  }

  async markNoShow(businessId: string, bookingId: string) {
    const booking = await this.getForBusiness(businessId, bookingId);
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('Only confirmed bookings can be marked as no-show');
    }
    return this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.NO_SHOW },
      include: BOOKING_INCLUDE,
    });
  }

  // ── Admin-facing — global read-only supervision, never a second management surface ────────

  async listForAdmin(query: ListAdminBookingsQueryDto) {
    const { skip, take, page, pageSize } = resolvePagination(query);
    const where: Prisma.BookingWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.businessId ? { businessId: query.businessId } : {}),
      ...(query.search
        ? {
            OR: [
              { user: { firstName: { contains: query.search, mode: 'insensitive' } } },
              { user: { lastName: { contains: query.search, mode: 'insensitive' } } },
              { service: { name: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [total, bookings] = await this.prisma.$transaction([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({
        where,
        skip,
        take,
        orderBy: { startTime: 'desc' },
        include: BOOKING_INCLUDE,
      }),
    ]);
    return { data: bookings, meta: { page, pageSize, total } };
  }

  async getForAdmin(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, include: BOOKING_INCLUDE });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  private assertCancellable(booking: { status: BookingStatus; startTime: Date }) {
    if (booking.status !== BookingStatus.PENDING && booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('This booking can no longer be cancelled');
    }
    // No configurable cancellation-window policy exists yet (§15 — identified as pending
    // configuration, not invented here) — the only real rule enforced is that a booking whose
    // appointment has already started can't be cancelled after the fact.
    if (booking.startTime.getTime() <= Date.now()) {
      throw new BadRequestException('This booking has already started and can no longer be cancelled');
    }
  }

  private async getBusinessOwnerId(businessId: string): Promise<string> {
    const business = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { ownerId: true } });
    return business.ownerId;
  }
}
