import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BookingSource,
  BookingStatus,
  BusinessCapabilityType,
  BusinessStatus,
  NotificationAudience,
  PaymentStatus,
  Prisma,
  ServiceLocationType,
  ServiceType,
  TransactionType,
} from '@prisma/client';
import { resolvePagination } from '@bingoplus/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { PetsService } from '../pets/pets.service';
import { NotificationService } from '../notifications/notification.service';
import { PaymentService } from '../payments/payment.service';
import { PricingConfigService, computeServiceFeeAmount } from '../pricing/pricing-config.service';
import { BookingSlotUnavailableException } from '../../common/exceptions/booking-slot-unavailable.exception';
import { DEFAULT_SERVICE_CAPACITY } from '../services/services.service';
import { isMembershipStatusGoodStanding } from '../memberships/membership-visibility.util';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ListAdminBookingsQueryDto, ListBusinessBookingsQueryDto, ListCustomerBookingsQueryDto } from './dto/list-bookings-query.dto';
import { CreateManualBookingBlockDto } from './dto/manual-block.dto';
import { CalendarQueryDto } from './dto/calendar-query.dto';

const ACTIVE_STATUSES: BookingStatus[] = [BookingStatus.PENDING, BookingStatus.CONFIRMED];

/** Booked by check-in/check-out date range instead of a time-of-day slot — see the DAY_UNIT_TYPES
 * branch in create() and Service.operatingDays' schema comment. */
const DAY_UNIT_TYPES: ServiceType[] = [ServiceType.DAYCARE, ServiceType.BOARDING];

// Same weekday-indexing convention as getOpeningStatus() in @bingoplus/utils (Business.openingHours
// keys), kept as a local copy since that helper's WEEKDAY_KEYS isn't exported — both read the exact
// same JSON shape and must stay in sync if that shape ever changes.
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const BOOKING_INCLUDE = {
  service: true,
  pet: { include: { species: true } },
  business: {
    select: { id: true, tradeName: true, city: true, addressLine: true, logoUrl: true, phone: true, latitude: true, longitude: true },
  },
  user: { select: { id: true, firstName: true, lastName: true, phone: true } },
  // Booking payment state (§ cash/card choice) — surfaced on every booking read (customer,
  // business, admin) via the existing 1:1 Payment relation rather than a second field on Booking
  // itself, so there is exactly one place ("is there a Payment row, and what's its provider/
  // status") that answers "is this booking paid, and how". See chooseCashPayment/markCashPaid.
  payment: true,
} satisfies Prisma.BookingInclude;

/** Distinguishes a cash-to-the-business Payment row from a real Sandbox-processed one (whose
 * `provider` is always `this.payments.providerName`, e.g. "sandbox") — see chooseCashPayment/
 * markCashPaid. Never passed to PaymentService, which only ever deals in provider-processed
 * payments; a CASH row is created/settled directly against the Payment table instead. */
const CASH_PAYMENT_PROVIDER = 'CASH';

function minutesToHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

/** Local calendar date as "YYYY-MM-DD" — never `.toISOString()`, which converts to UTC first and
 * silently rolls the date forward once local time has passed UTC midnight (see the same note in
 * bookings.service.spec.ts and apps/business's bookings page). */
function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface SlotCandidate {
  startTime: string;
  endTime: string;
  start: Date;
  end: Date;
}

/** Walks a day's opening-hours window in `durationMinutes` steps, producing every slot candidate —
 * shared by getAvailableSlots (customer-facing, future-only) and getCalendar (business-facing,
 * shows the whole range including past slots so gaps/occupancy are visible either way). */
function buildSlotCandidates(dayStart: Date, hours: { open?: string; close?: string } | undefined, durationMinutes: number): SlotCandidate[] {
  if (!hours?.open || !hours?.close) return [];
  const [openH, openM] = hours.open.split(':').map(Number);
  const [closeH, closeM] = hours.close.split(':').map(Number);
  const dayStartMinutes = openH * 60 + openM;
  const dayEndMinutes = closeH * 60 + closeM;

  const candidates: SlotCandidate[] = [];
  for (let m = dayStartMinutes; m + durationMinutes <= dayEndMinutes; m += durationMinutes) {
    const start = new Date(dayStart);
    start.setHours(0, m, 0, 0);
    const end = new Date(start.getTime() + durationMinutes * 60000);
    candidates.push({ startTime: minutesToHHMM(m), endTime: minutesToHHMM(m + durationMinutes), start, end });
  }
  return candidates;
}

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pets: PetsService,
    private readonly notifications: NotificationService,
    private readonly payments: PaymentService,
    private readonly pricingConfig: PricingConfigService,
  ) {}

  // ── Availability — computed live from Business.openingHours + Service.durationMinutes +
  // existing Bookings, never stored/cached, so it's always correct (§9/10). ──────────────────

  async getAvailableSlots(serviceId: string, dateStr: string) {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, active: true, deletedAt: null },
      include: {
        business: { select: { openingHours: true, status: true, membership: { select: { status: true } } } },
      },
    });
    if (!service) throw new NotFoundException('Service not found');
    if (DAY_UNIT_TYPES.includes(service.type)) {
      throw new BadRequestException('This service is booked by date range (check-in/check-out), not a time slot');
    }
    if (service.business.status !== BusinessStatus.ACTIVE) return [];
    if (!isMembershipStatusGoodStanding(service.business.membership?.status)) return [];

    const dayStart = new Date(`${dateStr}T00:00:00`);
    const hours = (service.business.openingHours as Record<string, { open?: string; close?: string }> | null)?.[
      WEEKDAY_KEYS[dayStart.getDay()]
    ];
    const capacity = service.capacity ?? DEFAULT_SERVICE_CAPACITY;
    const candidates = buildSlotCandidates(dayStart, hours, service.durationMinutes);
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
      include: {
        species: { include: { species: true } },
        business: { include: { membership: { select: { status: true } } } },
      },
    });
    if (!service || !service.active || service.deletedAt) throw new NotFoundException('Service not found');
    if (service.business.status !== BusinessStatus.ACTIVE) {
      throw new BadRequestException('This business is not currently accepting bookings');
    }
    if (!isMembershipStatusGoodStanding(service.business.membership?.status)) {
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

    const atCustomerHome = this.resolveAtCustomerHome(service.locationType, dto.atCustomerHome);

    let bookingDate: Date;
    let startTime: Date;
    let endTime: Date;
    let price: number | Prisma.Decimal;
    let billableDays: number | null = null;

    if (DAY_UNIT_TYPES.includes(service.type)) {
      if (!dto.checkOutDate) {
        throw new BadRequestException('checkOutDate is required for this service');
      }
      const checkIn = new Date(`${dto.date}T00:00:00`);
      const checkOut = new Date(`${dto.checkOutDate}T00:00:00`);
      if (checkOut.getTime() <= checkIn.getTime()) {
        throw new BadRequestException('checkOutDate must be after date');
      }
      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);
      if (checkIn.getTime() < todayMidnight.getTime()) {
        throw new BadRequestException('Cannot book a check-in date in the past');
      }

      // Only nights/days the service actually operates count — e.g. a Mon-Fri daycare booked
      // across a weekend only charges/reserves capacity for the weekdays in range.
      let count = 0;
      for (const d = new Date(checkIn); d.getTime() < checkOut.getTime(); d.setDate(d.getDate() + 1)) {
        if (service.operatingDays.includes(WEEKDAY_KEYS[d.getDay()])) count++;
      }
      if (count === 0) {
        throw new BadRequestException('No operating days fall within the selected date range');
      }

      bookingDate = checkIn;
      startTime = checkIn;
      endTime = checkOut;
      price = Number(service.price) * count;
      billableDays = count;
    } else {
      if (!dto.startTime || !/^([01]\d|2[0-3]):[0-5]\d$/.test(dto.startTime)) {
        throw new BadRequestException('Invalid startTime');
      }
      const [h, m] = dto.startTime.split(':').map(Number);
      bookingDate = new Date(`${dto.date}T00:00:00`);
      startTime = new Date(bookingDate);
      startTime.setHours(h, m, 0, 0);
      endTime = new Date(startTime.getTime() + service.durationMinutes * 60000);
      if (startTime.getTime() <= Date.now()) {
        throw new BadRequestException('Cannot book a time slot in the past');
      }
      // getAvailableSlots() only ever offers times inside Business.openingHours — but this
      // endpoint never re-checked that itself, trusting the client-submitted startTime completely
      // beyond "not in the past". Re-validated here the same way, so a booking can never land
      // outside business hours (e.g. after closing) regardless of what the client actually sent.
      const hours = (service.business.openingHours as Record<string, { open?: string; close?: string }> | null)?.[
        WEEKDAY_KEYS[bookingDate.getDay()]
      ];
      if (!hours?.open || !hours?.close) {
        throw new BadRequestException('This business is closed that day');
      }
      const [openH, openM] = hours.open.split(':').map(Number);
      const [closeH, closeM] = hours.close.split(':').map(Number);
      const openMinutes = openH * 60 + openM;
      const closeMinutes = closeH * 60 + closeM;
      const startMinutes = h * 60 + m;
      if (startMinutes < openMinutes || startMinutes + service.durationMinutes > closeMinutes) {
        throw new BadRequestException('This time is outside the business’s opening hours');
      }
      price = service.price;
    }

    // Checkout breakdown (§ "pagar con tarjeta" must show valor + impuestos + tarifa de servicio) —
    // computed once here, from the live PricingConfiguration, and frozen onto the Booking row
    // exactly like `price` above: a later admin change to defaultTaxPercent/serviceFeePercent/
    // serviceFeeFixed must never retroactively rewrite what this booking already charges. A
    // Service has no ProductTaxCategory-style exemption concept (unlike Product) — every service
    // is simply taxed at the flat default rate. serviceFee reuses the exact same formula
    // PriceCalculationService/MembershipsService.computeServiceFee use, via the shared
    // computeServiceFeeAmount helper, rather than a third, possibly-diverging copy of the math.
    const priceDecimal = new Prisma.Decimal(price);
    const pricingConfigValues = await this.pricingConfig.get();
    const tax = priceDecimal.mul(pricingConfigValues.defaultTaxPercent);
    const serviceFee = computeServiceFeeAmount(priceDecimal, pricingConfigValues);
    const total = priceDecimal.plus(tax).plus(serviceFee);

    const booking = await this.prisma.$transaction(async (tx) => {
      await this.assertCapacityAvailable(tx, service.id, startTime, endTime, service.capacity ?? DEFAULT_SERVICE_CAPACITY);

      return tx.booking.create({
        data: {
          userId,
          petId: pet.id,
          businessId: service.businessId,
          serviceId: service.id,
          date: bookingDate,
          startTime,
          endTime,
          price: priceDecimal,
          tax,
          serviceFee,
          total,
          billableDays,
          atCustomerHome,
          notes: dto.notes,
          idempotencyKey: dto.idempotencyKey,
          status: BookingStatus.PENDING,
          source: BookingSource.APP,
        },
        include: BOOKING_INCLUDE,
      });
    });

    void this.notifications.notify({
      userId,
      audience: NotificationAudience.CUSTOMER,
      event: 'booking.created',
      title: 'Reserva creada',
      body: `Tu reserva de "${booking.service.name}" quedó pendiente de confirmación.`,
      data: { bookingId: booking.id },
    });
    void this.notifications.notify({
      userId: service.business.ownerId,
      audience: NotificationAudience.BUSINESS,
      event: 'booking.new',
      title: 'Nueva reserva',
      body: `${booking.user!.firstName} reservó "${booking.service.name}".`,
      data: { bookingId: booking.id },
    });

    return booking;
  }

  /** AT_CUSTOMER_HOME leaves no real choice — always true. Only BOTH actually asks the customer,
   * and requires an explicit answer rather than silently defaulting one way. Everything else
   * (AT_BUSINESS, and defensively any unrecognized/missing value) is false. */
  private resolveAtCustomerHome(locationType: ServiceLocationType, requested?: boolean): boolean {
    if (locationType === ServiceLocationType.AT_CUSTOMER_HOME) return true;
    if (locationType === ServiceLocationType.BOTH) {
      if (requested === undefined) {
        throw new BadRequestException('atCustomerHome is required for this service (choose at home or at the business)');
      }
      return requested;
    }
    return false;
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
      audience: NotificationAudience.BUSINESS,
      event: 'booking.cancelled',
      title: 'Reserva cancelada',
      body: `${updated.user!.firstName} canceló su reserva de "${updated.service.name}".`,
      data: { bookingId: updated.id },
    });
    return updated;
  }

  // ── Booking payment (§1) — a booking only becomes payable once the BUSINESS has confirmed it
  // (see confirm() below); payment no longer drives confirmation the other way around (that
  // coupling — a successful card payment silently confirming a still-PENDING booking — is what
  // this phase inverts). Two payment methods, one uniform representation: the existing 1:1
  // Payment relation (see BOOKING_INCLUDE's comment). CARD reuses PaymentService exactly as
  // CheckoutService does for Orders (createPayment/confirmPayment against the real, if Sandbox,
  // provider). CASH never touches PaymentService/the provider at all — chooseCashPayment/
  // markCashPaid write the Payment row directly, since there is no provider-side transaction to
  // create or confirm for money that changes hands in person. ─────────────────────────────

  async createBookingPayment(userId: string, bookingId: string, idempotencyKey: string) {
    const booking = await this.getForCustomer(userId, bookingId);
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('Only a confirmed booking can be paid online — wait for the business to confirm it first');
    }
    if (booking.payment) {
      if (booking.payment.provider === CASH_PAYMENT_PROVIDER) {
        throw new BadRequestException('This booking is already set to be paid in cash to the business');
      }
      // Same method retried (e.g. a resumed/abandoned checkout) — return what's there instead of
      // hitting the Payment.bookingId unique constraint with a second row for the same booking.
      return booking.payment;
    }
    // Charges price + tax + serviceFee (booking.total), never booking.price alone — see the
    // Booking model comment on `total` and BookingsService.create where it's computed/frozen.
    return this.prisma.$transaction((tx) =>
      this.payments.createPayment(tx, { bookingId: booking.id }, booking.total, 'USD', idempotencyKey),
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
    const payment = booking.payment;
    if (!payment) throw new NotFoundException('No payment found for this booking');
    if (payment.provider === CASH_PAYMENT_PROVIDER) {
      throw new BadRequestException('This booking is set to be paid in cash — there is no online payment to confirm');
    }
    if (payment.status === PaymentStatus.PAID) {
      return { payment, booking };
    }
    const result = await this.payments.confirmPayment(payment.id, simulateFailure ? 'failure' : 'success');
    await this.syncFromPaymentStatus(booking.id, result.status);
    return { payment: result, booking: await this.getForCustomer(userId, booking.id) };
  }

  /**
   * Customer's "pagar en efectivo" choice. Mirrors createBookingPayment's shape/guards (must
   * already be CONFIRMED, idempotent against a repeat choice, mutually exclusive with CARD) but
   * writes the Payment row directly instead of going through PaymentService — there is no
   * provider-side payment to create for cash. Left PENDING until the business actually receives
   * the cash and calls markCashPaid; never auto-marks itself paid.
   */
  async chooseCashPayment(userId: string, bookingId: string) {
    const booking = await this.getForCustomer(userId, bookingId);
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('Only a confirmed booking can select a payment method — wait for the business to confirm it first');
    }
    if (booking.payment) {
      if (booking.payment.provider !== CASH_PAYMENT_PROVIDER) {
        throw new BadRequestException('This booking is already set to be paid by card');
      }
      return booking.payment; // idempotent retry of the same choice
    }
    const payment = await this.prisma.payment.create({
      data: {
        bookingId: booking.id,
        provider: CASH_PAYMENT_PROVIDER,
        // Deliberately still just `price`, never booking.total — the owner's request (checkout
        // showing/charging valor + impuestos + tarifa de servicio) was specifically about the CARD
        // flow. A cash booking is money the customer hands the business directly in person, with
        // no BINGO+ processing step to collect a tax/service-fee line through — extending
        // total-with-fees to cash here would be inventing a new charge nobody asked for, and there
        // is no payout mechanism to reconcile a BINGO+ share out of cash the business collected
        // itself (see PayoutsService — only a CARD-paid booking is ever payable back).
        amount: booking.price,
        currency: 'USD',
        status: PaymentStatus.PENDING,
      },
    });
    const ownerId = await this.getBusinessOwnerId(booking.businessId);
    void this.notifications.notify({
      userId: ownerId,
      audience: NotificationAudience.BUSINESS,
      event: 'booking.cash_payment_pending',
      title: 'Pago en efectivo pendiente',
      body: `${booking.user!.firstName} pagará en efectivo la reserva de "${booking.service.name}". Cóbralo antes de iniciar el servicio.`,
      data: { bookingId: booking.id },
    });
    return payment;
  }

  /**
   * Business confirms cash was actually received in person — the CASH counterpart to
   * confirmBookingPayment(), but updates the Payment row directly rather than calling
   * PaymentService.confirmPayment() (that method requires a providerPaymentId and calls out to
   * the provider, neither of which exists for a cash payment). Deliberately never touches
   * Booking.status: completion stays entirely BookingsService.complete()'s job, unchanged — a
   * business marks cash received first, then separately marks the booking completed once the
   * service is actually delivered, exactly as the owner described the flow.
   */
  async markCashPaid(businessId: string, bookingId: string) {
    const booking = await this.getForBusiness(businessId, bookingId);
    if (!booking.payment || booking.payment.provider !== CASH_PAYMENT_PROVIDER) {
      throw new BadRequestException('This booking is not set to be paid in cash');
    }
    if (booking.payment.status === PaymentStatus.PAID) {
      return booking; // idempotent
    }
    await this.prisma.$transaction([
      this.prisma.payment.update({ where: { id: booking.payment.id }, data: { status: PaymentStatus.PAID } }),
      this.prisma.transaction.create({
        data: {
          paymentId: booking.payment.id,
          type: TransactionType.CHARGE,
          amount: booking.payment.amount,
          status: PaymentStatus.PAID,
          providerRef: null,
        },
      }),
    ]);
    void this.notifications.notify({
      userId: booking.userId!,
      audience: NotificationAudience.CUSTOMER,
      event: 'booking.payment_received',
      title: 'Pago recibido',
      body: `${booking.business.tradeName} confirmó tu pago en efectivo de "${booking.service.name}".`,
      data: { bookingId: booking.id },
    });
    return this.getForBusiness(businessId, bookingId);
  }

  /** Entry point for both the direct-confirm path and the webhook path (mirrors
   * CheckoutService.syncOrderFromPaymentStatus). Only ever reached for a CARD payment now — a
   * CASH payment never goes through PaymentService/this sync at all (see markCashPaid). No longer
   * confirms the booking on a successful payment: confirmation already happened earlier, by the
   * business, independently (see confirm()) — paying by card at this point just marks an
   * already-CONFIRMED booking's Payment PAID. A failed payment deliberately leaves the booking
   * exactly as it was — no auto-cancellation rule exists in the spec for this, and inventing one
   * here would be exactly the "no inventar reglas financieras" violation the phase forbids. */
  async syncFromPaymentStatus(bookingId: string, paymentStatus: PaymentStatus) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, include: { service: true } });
    if (!booking) return;
    if (paymentStatus === PaymentStatus.PAID) {
      void this.notifications.notify({
        userId: booking.userId!,
        audience: NotificationAudience.CUSTOMER,
        event: 'booking.payment_received',
        title: 'Pago recibido',
        body: `Tu pago de "${booking.service.name}" fue procesado con éxito.`,
        data: { bookingId: booking.id },
      });
    } else if (paymentStatus === PaymentStatus.FAILED) {
      void this.notifications.notify({
        userId: booking.userId!,
        audience: NotificationAudience.CUSTOMER,
        event: 'booking.payment_failed',
        title: 'Pago no procesado',
        body: 'No pudimos procesar el pago de tu reserva. Puedes intentarlo de nuevo.',
        data: { bookingId: booking.id },
      });
    }
  }

  // ── Business-facing ───────────────────────────────────────────────────────

  async listForBusiness(businessId: string, query: ListBusinessBookingsQueryDto) {
    const dateFilter =
      query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: new Date(`${query.from}T00:00:00`) } : {}),
              ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999`) } : {}),
            },
          }
        : query.date
          ? { date: { gte: new Date(`${query.date}T00:00:00`), lte: new Date(`${query.date}T23:59:59.999`) } }
          : {};
    const where: Prisma.BookingWhereInput = {
      businessId,
      ...(query.status ? { status: query.status } : {}),
      ...dateFilter,
    };
    return this.prisma.booking.findMany({ where, orderBy: { startTime: 'asc' }, include: BOOKING_INCLUDE });
  }

  async getForBusiness(businessId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, include: BOOKING_INCLUDE });
    if (!booking || booking.businessId !== businessId) throw new NotFoundException('Booking not found');
    return booking;
  }

  /**
   * Business-entered manual block — an off-platform appointment (phone/walk-in) the business logs
   * so it isn't double-booked online. Goes through the exact same row-locked capacity check as
   * create() (see assertCapacityAvailable), so it genuinely competes with app bookings for the
   * service's capacity rather than being tracked separately. Created directly CONFIRMED — there's
   * no customer to wait on a business confirmation step, the business is confirming it itself by
   * entering it.
   */
  async createManualBlock(businessId: string, dto: CreateManualBookingBlockDto) {
    const service = await this.prisma.service.findUnique({ where: { id: dto.serviceId } });
    if (!service || service.businessId !== businessId || service.deletedAt) {
      throw new NotFoundException('Service not found');
    }
    if (!service.active) {
      throw new BadRequestException('Cannot add a manual block to an inactive service');
    }

    let bookingDate: Date;
    let startTime: Date;
    let endTime: Date;
    let billableDays: number | null = null;

    if (DAY_UNIT_TYPES.includes(service.type)) {
      if (!dto.checkOutDate) throw new BadRequestException('checkOutDate is required for this service');
      const checkIn = new Date(`${dto.date}T00:00:00`);
      const checkOut = new Date(`${dto.checkOutDate}T00:00:00`);
      if (checkOut.getTime() <= checkIn.getTime()) {
        throw new BadRequestException('checkOutDate must be after date');
      }
      let count = 0;
      for (const d = new Date(checkIn); d.getTime() < checkOut.getTime(); d.setDate(d.getDate() + 1)) {
        if (service.operatingDays.includes(WEEKDAY_KEYS[d.getDay()])) count++;
      }
      bookingDate = checkIn;
      startTime = checkIn;
      endTime = checkOut;
      billableDays = count;
    } else {
      if (!dto.startTime || !dto.endTime) {
        throw new BadRequestException('startTime and endTime are required for this service');
      }
      const [startH, startM] = dto.startTime.split(':').map(Number);
      const [endH, endM] = dto.endTime.split(':').map(Number);
      bookingDate = new Date(`${dto.date}T00:00:00`);
      startTime = new Date(bookingDate);
      startTime.setHours(startH, startM, 0, 0);
      endTime = new Date(bookingDate);
      endTime.setHours(endH, endM, 0, 0);
      // A manual block deliberately isn't constrained to the service's duration grid or business
      // opening hours the way an app booking is — it's a record of something that already happened
      // off-platform (a phone call, a walk-in outside the online flow), not a new slot offered to
      // customers. The one rule that always holds regardless of source: it has to be a real
      // interval.
      if (endTime.getTime() <= startTime.getTime()) {
        throw new BadRequestException('endTime must be after startTime');
      }
    }

    const capacity = service.capacity ?? DEFAULT_SERVICE_CAPACITY;
    return this.prisma.$transaction(async (tx) => {
      await this.assertCapacityAvailable(tx, service.id, startTime, endTime, capacity);
      return tx.booking.create({
        data: {
          userId: null,
          petId: null,
          businessId,
          serviceId: service.id,
          date: bookingDate,
          startTime,
          endTime,
          price: 0,
          billableDays,
          atCustomerHome: false,
          notes: dto.reason,
          status: BookingStatus.CONFIRMED,
          source: BookingSource.MANUAL,
        },
        include: BOOKING_INCLUDE,
      });
    });
  }

  /** Business-side capacity/calendar view: for each date in [from, to] and each matching service,
   * returns both a slot-shaded capacity grid (for showing open/full at a glance and gating "add a
   * manual block") and the actual bookings/blocks (app + manual, real start/end times) to render as
   * calendar items. Reuses the exact same overlap-counting shape as getAvailableSlots/create — a
   * MANUAL row is just another active Booking, so it's automatically reflected here with zero extra
   * bookkeeping. */
  async getCalendar(businessId: string, query: CalendarQueryDto) {
    const fromDate = new Date(`${query.from}T00:00:00`);
    const toDate = new Date(`${query.to}T00:00:00`);
    if (toDate.getTime() < fromDate.getTime()) throw new BadRequestException('`to` must not be before `from`');
    const spanDays = Math.round((toDate.getTime() - fromDate.getTime()) / 86400000) + 1;
    if (spanDays > 31) throw new BadRequestException('Date range too large — max 31 days');

    const services = await this.prisma.service.findMany({
      where: {
        businessId,
        active: true,
        deletedAt: null,
        ...(query.serviceId ? { id: query.serviceId } : {}),
      },
      include: { business: { select: { openingHours: true } } },
    });
    if (query.serviceId && services.length === 0) throw new NotFoundException('Service not found');
    if (services.length === 0) return { from: query.from, to: query.to, slots: [], bookings: [] };

    const rangeEnd = new Date(toDate.getTime() + 24 * 60 * 60000); // exclusive
    // Deliberately NOT ACTIVE_STATUSES here — that list (PENDING/CONFIRMED) is for the
    // capacity-blocking checks in create()/createManualBlock(), where a COMPLETED booking rightly
    // no longer holds a future slot. The calendar is a display of what actually happened, so a
    // COMPLETED booking must keep showing (and keep counting as occupied) in the day/slot it
    // occupied — otherwise it silently vanishes from the calendar the moment the business marks it
    // done. CANCELLED/NO_SHOW are excluded on purpose: a cancelled slot genuinely freed back up.
    const bookings = await this.prisma.booking.findMany({
      where: {
        businessId,
        serviceId: { in: services.map((s) => s.id) },
        status: { in: [...ACTIVE_STATUSES, BookingStatus.COMPLETED] },
        startTime: { lt: rangeEnd },
        endTime: { gt: fromDate },
      },
      include: { user: { select: { firstName: true, lastName: true } }, pet: { select: { name: true } }, service: { select: { name: true } } },
      orderBy: { startTime: 'asc' },
    });

    const slots: {
      serviceId: string;
      date: string;
      startTime: string;
      endTime: string;
      capacity: number;
      occupied: number;
      remaining: number;
    }[] = [];

    for (const service of services) {
      const capacity = service.capacity ?? DEFAULT_SERVICE_CAPACITY;
      const serviceBookings = bookings.filter((b) => b.serviceId === service.id);
      const isDayUnit = DAY_UNIT_TYPES.includes(service.type);

      for (let m = 0; m < spanDays; m++) {
        const day = new Date(fromDate);
        day.setDate(day.getDate() + m);
        const dateStr = toLocalDateString(day);

        if (isDayUnit) {
          if (!service.operatingDays.includes(WEEKDAY_KEYS[day.getDay()])) continue;
          const dayStart = new Date(day);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60000);
          const occupied = serviceBookings.filter((b) => b.startTime < dayEnd && b.endTime > dayStart).length;
          slots.push({ serviceId: service.id, date: dateStr, startTime: '00:00', endTime: '24:00', capacity, occupied, remaining: Math.max(capacity - occupied, 0) });
          continue;
        }

        const hours = (service.business.openingHours as Record<string, { open?: string; close?: string }> | null)?.[WEEKDAY_KEYS[day.getDay()]];
        const candidates = buildSlotCandidates(day, hours, service.durationMinutes);
        for (const c of candidates) {
          const occupied = serviceBookings.filter((b) => b.startTime < c.end && b.endTime > c.start).length;
          slots.push({
            serviceId: service.id,
            date: dateStr,
            startTime: c.startTime,
            endTime: c.endTime,
            capacity,
            occupied,
            remaining: Math.max(capacity - occupied, 0),
          });
        }
      }
    }

    return {
      from: query.from,
      to: query.to,
      slots,
      bookings: bookings.map((b) => ({
        id: b.id,
        serviceId: b.serviceId,
        serviceName: b.service.name,
        source: b.source,
        status: b.status,
        startTime: b.startTime,
        endTime: b.endTime,
        customerName: b.user ? `${b.user.firstName} ${b.user.lastName}`.trim() : null,
        petName: b.pet?.name ?? null,
        reason: b.notes,
        atCustomerHome: b.atCustomerHome,
      })),
    };
  }

  /** Purely a status transition — deliberately knows nothing about payment. A booking becomes
   * payable (see createBookingPayment/chooseCashPayment) only once it's CONFIRMED, but
   * confirmation itself never depends on, waits for, or is triggered by payment; the business
   * confirms independently of whether/how the customer ends up paying. The notification now tells
   * the customer a payment method choice is waiting, since that's the very next thing to do. */
  async confirm(businessId: string, bookingId: string) {
    const booking = await this.getForBusiness(businessId, bookingId);
    if (booking.source === BookingSource.MANUAL) {
      throw new BadRequestException('A manual block is already confirmed by definition');
    }
    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException('Only pending bookings can be confirmed');
    }
    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.CONFIRMED },
      include: BOOKING_INCLUDE,
    });
    void this.notifications.notify({
      userId: updated.userId!,
      audience: NotificationAudience.CUSTOMER,
      event: 'booking.confirmed',
      title: 'Reserva confirmada',
      body: `${updated.business.tradeName} confirmó tu reserva de "${updated.service.name}". Ya puedes elegir cómo pagar: con tarjeta o en efectivo.`,
      data: { bookingId: updated.id },
    });
    return updated;
  }

  /** Cancelling a MANUAL block is how a business undoes a mistaken entry or walks back an
   * off-platform booking that fell through — same status machinery as a real booking (frees its
   * capacity immediately), just with no customer to notify and no "already started" restriction
   * (the business may be cleaning up a stale manual entry after the fact). */
  async cancelForBusiness(businessId: string, bookingId: string, reason?: string) {
    const booking = await this.getForBusiness(businessId, bookingId);
    this.assertCancellable(booking);
    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.CANCELLED, notes: reason ? `${booking.notes ?? ''}\n[Cancelado por negocio] ${reason}`.trim() : booking.notes },
      include: BOOKING_INCLUDE,
    });
    if (updated.source !== BookingSource.MANUAL) {
      void this.notifications.notify({
        userId: updated.userId!,
        audience: NotificationAudience.CUSTOMER,
        event: 'booking.cancelled',
        title: 'Reserva cancelada',
        body: `${updated.business.tradeName} canceló tu reserva de "${updated.service.name}".`,
        data: { bookingId: updated.id },
      });
    }
    return updated;
  }

  async complete(businessId: string, bookingId: string) {
    const booking = await this.getForBusiness(businessId, bookingId);
    if (booking.source === BookingSource.MANUAL) {
      throw new BadRequestException('A manual block cannot be completed — cancel it instead once it no longer applies');
    }
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('Only confirmed bookings can be completed');
    }
    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.COMPLETED },
      include: BOOKING_INCLUDE,
    });
    void this.notifications.notify({
      userId: updated.userId!,
      audience: NotificationAudience.CUSTOMER,
      event: 'booking.completed',
      title: 'Reserva completada',
      body: `Tu reserva de "${updated.service.name}" fue completada.`,
      data: { bookingId: updated.id },
    });
    return updated;
  }

  async markNoShow(businessId: string, bookingId: string) {
    const booking = await this.getForBusiness(businessId, bookingId);
    if (booking.source === BookingSource.MANUAL) {
      throw new BadRequestException('A manual block has no customer to mark as a no-show — cancel it instead');
    }
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

  private assertCancellable(booking: { status: BookingStatus; startTime: Date; source?: BookingSource }) {
    if (booking.status !== BookingStatus.PENDING && booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('This booking can no longer be cancelled');
    }
    // No configurable cancellation-window policy exists yet (§15 — identified as pending
    // configuration, not invented here) — the only real rule enforced is that a booking whose
    // appointment has already started can't be cancelled after the fact. A MANUAL block is exempt:
    // the business may be cleaning up a stale off-platform entry (the appointment fell through, or
    // it was logged for a date that's already passed) well after its start time.
    if (booking.source !== BookingSource.MANUAL && booking.startTime.getTime() <= Date.now()) {
      throw new BadRequestException('This booking has already started and can no longer be cancelled');
    }
  }

  /** Row-locks the Service (`SELECT ... FOR UPDATE`) before counting overlapping active bookings —
   * shared by create() and createManualBlock() so an app booking and a manual block are genuinely
   * fungible occupants of a service's capacity, checked by the exact same code, not two parallel
   * (and possibly inconsistent) tallies. Must be called inside the same `tx` that will perform the
   * `create`, so the lock actually serializes concurrent attempts at the same service/slot. */
  private async assertCapacityAvailable(
    tx: Prisma.TransactionClient,
    serviceId: string,
    startTime: Date,
    endTime: Date,
    capacity: number,
  ) {
    await tx.$queryRaw`SELECT id FROM "Service" WHERE id = ${serviceId} FOR UPDATE`;
    const overlapping = await tx.booking.count({
      where: {
        serviceId,
        status: { in: ACTIVE_STATUSES },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });
    if (overlapping >= capacity) throw new BookingSlotUnavailableException();
  }

  private async getBusinessOwnerId(businessId: string): Promise<string> {
    const business = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { ownerId: true } });
    return business.ownerId;
  }
}
