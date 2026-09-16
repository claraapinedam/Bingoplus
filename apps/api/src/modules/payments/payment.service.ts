import { createHash } from 'crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentStatus, Prisma, TransactionType } from '@prisma/client';
import { resolvePagination } from '@bingoplus/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { PAYMENT_PROVIDER_TOKEN, PaymentProvider } from './providers/payment-provider.interface';

/**
 * Owns Payment/Transaction/WebhookEvent persistence and all direct PaymentProvider calls (§16).
 * Deliberately knows nothing about Order — CheckoutService is the only place that reads a
 * payment result and decides what it means for the Order state machine, so this service stays
 * reusable and testable on its own.
 */
@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER_TOKEN) private readonly provider: PaymentProvider,
  ) {}

  get providerName() {
    return this.provider.name;
  }

  /**
   * Idempotent: a retried create with the same idempotencyKey returns the original Payment (§21).
   * FASE 9 §1: `target` is exactly one of `{ orderId }` / `{ bookingId }` — the type itself makes
   * "both" or "neither" impossible to construct at any call site, on top of the DB-level CHECK
   * constraint (`payment_exactly_one_target`) that guards it even if a caller went around
   * TypeScript (e.g. a raw query).
   */
  async createPayment(
    tx: Prisma.TransactionClient,
    target: { orderId: string; bookingId?: never } | { bookingId: string; orderId?: never },
    amount: Prisma.Decimal,
    currency: string,
    idempotencyKey: string,
  ) {
    const existing = await tx.payment.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;

    const referenceId = target.orderId ?? target.bookingId!;
    const result = await this.provider.createPayment({ referenceId, amount, currency, idempotencyKey });
    return tx.payment.create({
      data: {
        orderId: target.orderId,
        bookingId: target.bookingId,
        provider: this.provider.name,
        providerPaymentId: result.providerPaymentId,
        idempotencyKey,
        amount,
        currency,
        status: result.status as PaymentStatus,
      },
    });
  }

  /** Idempotent: confirming an already-PAID payment again just returns it, never double-charges. */
  async confirmPayment(paymentId: string, simulate?: 'success' | 'failure') {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status === PaymentStatus.PAID) return payment;
    if (!payment.providerPaymentId) throw new BadRequestException('Payment was never created with the provider');

    const result = await this.provider.confirmPayment(payment.providerPaymentId, simulate);
    const [updated] = await this.prisma.$transaction([
      this.prisma.payment.update({ where: { id: paymentId }, data: { status: result.status as PaymentStatus } }),
      this.prisma.transaction.create({
        data: {
          paymentId,
          type: TransactionType.CHARGE,
          amount: payment.amount,
          status: result.status,
          providerRef: payment.providerPaymentId,
        },
      }),
    ]);
    return updated;
  }

  getPayment(paymentId: string) {
    return this.prisma.payment.findUnique({ where: { id: paymentId }, include: { transactions: true, refunds: true } });
  }

  /**
   * §22: validate signature → identify event → verify idempotency → record WebhookEvent →
   * update Payment. Returns the updated Payment (or null if the event carried no matching one,
   * or was already processed) so the caller can decide what it means for the Order.
   */
  async processWebhook(providerName: string, rawBody: string, signatureHeader: string | undefined) {
    if (providerName !== this.provider.name) {
      throw new BadRequestException(`Unknown payment provider "${providerName}"`);
    }
    if (!this.provider.verifyWebhookSignature(rawBody, signatureHeader)) {
      throw new BadRequestException('Invalid webhook signature');
    }
    const event = this.provider.parseWebhookEvent(rawBody);
    if (!event) throw new BadRequestException('Malformed webhook payload');

    const payloadHash = createHash('sha256').update(rawBody).digest('hex');

    const existing = await this.prisma.webhookEvent.findUnique({
      where: { provider_externalEventId: { provider: providerName, externalEventId: event.externalEventId } },
    });
    if (existing?.processed) {
      return { payment: null, duplicate: true };
    }

    const webhookEventRow =
      existing ??
      (await this.prisma.webhookEvent.create({
        data: { provider: providerName, externalEventId: event.externalEventId, eventType: event.eventType, payloadHash },
      }));

    const payment = await this.prisma.payment.findFirst({ where: { providerPaymentId: event.providerPaymentId } });
    let updatedPayment = payment;
    if (payment) {
      updatedPayment = await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: event.status as PaymentStatus },
      });
    }

    await this.prisma.webhookEvent.update({
      where: { id: webhookEventRow.id },
      data: { processed: true, processedAt: new Date() },
    });

    return { payment: updatedPayment, duplicate: false };
  }

  async refundPayment(tx: Prisma.TransactionClient, paymentId: string, orderId: string, amount: Prisma.Decimal, reason?: string, requestedBy?: string) {
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    if (!payment.providerPaymentId) throw new BadRequestException('Payment was never created with the provider');

    const refund = await tx.refund.create({
      data: { paymentId, orderId, amount, reason, requestedBy, status: 'PENDING' },
    });

    const result = await this.provider.refundPayment({ providerPaymentId: payment.providerPaymentId, amount });

    const [updatedRefund] = await Promise.all([
      tx.refund.update({
        where: { id: refund.id },
        data: { status: result.status, providerRef: result.providerRefundId },
      }),
      tx.transaction.create({
        data: {
          paymentId,
          type: TransactionType.REFUND,
          amount,
          status: result.status,
          providerRef: result.providerRefundId,
        },
      }),
    ]);

    if (result.status === 'COMPLETED') {
      const alreadyRefunded = await tx.refund.aggregate({
        where: { paymentId, status: 'COMPLETED' },
        _sum: { amount: true },
      });
      const totalRefunded = alreadyRefunded._sum.amount ?? new Prisma.Decimal(0);
      const isFullyRefunded = totalRefunded.gte(payment.amount);
      await tx.payment.update({
        where: { id: paymentId },
        data: { status: isFullyRefunded ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED },
      });
    }

    return updatedRefund;
  }

  // ── Admin-facing (FASE 6 §20/21) — read-only global supervision. Deliberately still returns
  // only the minimal Order context needed to identify the payment (order number, customer,
  // business) via a read include, not by teaching this service Order's own business logic —
  // never PAN/CVV/raw card data, which this schema never stores in the first place. ────────────

  async listForAdmin(query: {
    status?: PaymentStatus;
    search?: string;
    businessId?: string;
    page?: number;
    pageSize?: number;
  }) {
    const { skip, take, page, pageSize } = resolvePagination(query);
    // FASE 9 §1: a Payment now belongs to either an Order or a Booking — businessId/search must
    // match through whichever relation is actually populated, never silently hide Booking
    // payments just because the filter logic only knew about Order.
    const orderWhere: Prisma.OrderWhereInput = {
      ...(query.businessId ? { businessId: query.businessId } : {}),
      ...(query.search
        ? {
            OR: [
              { orderNumber: { contains: query.search, mode: 'insensitive' } },
              { user: { firstName: { contains: query.search, mode: 'insensitive' } } },
              { user: { lastName: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const bookingWhere: Prisma.BookingWhereInput = {
      ...(query.businessId ? { businessId: query.businessId } : {}),
      ...(query.search
        ? {
            OR: [
              { service: { name: { contains: query.search, mode: 'insensitive' } } },
              { user: { firstName: { contains: query.search, mode: 'insensitive' } } },
              { user: { lastName: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const hasFilter = Object.keys(orderWhere).length > 0;
    const where: Prisma.PaymentWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(hasFilter ? { OR: [{ order: orderWhere }, { booking: bookingWhere }] } : {}),
    };
    const [total, payments] = await this.prisma.$transaction([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              user: { select: { firstName: true, lastName: true } },
              business: { select: { id: true, tradeName: true } },
            },
          },
          booking: {
            select: {
              id: true,
              service: { select: { name: true } },
              user: { select: { firstName: true, lastName: true } },
              business: { select: { id: true, tradeName: true } },
            },
          },
          refunds: true,
        },
      }),
    ]);
    return { data: payments, meta: { page, pageSize, total } };
  }

  async getForAdmin(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            user: { select: { firstName: true, lastName: true } },
            business: { select: { id: true, tradeName: true } },
          },
        },
        booking: {
          select: {
            id: true,
            service: { select: { name: true } },
            user: { select: { firstName: true, lastName: true } },
            business: { select: { id: true, tradeName: true } },
          },
        },
        refunds: { orderBy: { createdAt: 'desc' } },
        transactions: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }
}
