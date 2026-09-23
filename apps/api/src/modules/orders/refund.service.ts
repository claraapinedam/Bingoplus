import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PaymentStatus, RefundStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentService } from '../payments/payment.service';

/**
 * §36: full or partial refunds, always tied to a Payment + Order. Not every real-world refund
 * scenario is wired end-to-end in this phase (no provider actually moves money — Sandbox always
 * "succeeds") but the request/record architecture and the guard against over-refunding are real.
 */
@Injectable()
export class RefundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentService,
  ) {}

  async refundOrder(orderId: string, amount: Prisma.Decimal, reason?: string, requestedBy?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { payment: true } });
    if (!order) throw new NotFoundException('Order not found');
    if (!order.payment) throw new BadRequestException('This order has no payment to refund');
    if (order.payment.status !== 'PAID' && order.payment.status !== 'PARTIALLY_REFUNDED') {
      throw new BadRequestException('Only a paid order can be refunded');
    }

    return this.prisma.$transaction(async (tx) => {
      const alreadyRefunded = await tx.refund.aggregate({
        where: { paymentId: order.payment!.id, status: 'COMPLETED' },
        _sum: { amount: true },
      });
      const totalRefunded = alreadyRefunded._sum.amount ?? new Prisma.Decimal(0);
      if (totalRefunded.plus(amount).gt(order.payment!.amount)) {
        throw new BadRequestException('Refund amount would exceed what was actually paid');
      }
      return this.payments.refundPayment(tx, order.payment!.id, orderId, amount, reason, requestedBy);
    });
  }

  listForOrder(orderId: string) {
    return this.prisma.refund.findMany({ where: { orderId }, orderBy: { createdAt: 'desc' } });
  }

  /**
   * Marks a PENDING refund as done once an admin has actually handled it (e.g. a bank transfer
   * outside the platform) — distinct from refundOrder() above, which calls the payment provider
   * directly. There's no provider call to make here: this only records that it happened, the same
   * way completing a manual off-system refund would in any system, and updates Payment.status
   * with the same REFUNDED-vs-PARTIALLY_REFUNDED logic PaymentService.refundPayment already uses
   * on its own completion path, so the two ways a refund can finish stay consistent.
   */
  async completeManual(refundId: string) {
    const refund = await this.prisma.refund.findUnique({ where: { id: refundId } });
    if (!refund) throw new NotFoundException('Refund not found');
    if (refund.status !== RefundStatus.PENDING) {
      throw new BadRequestException({
        error: { code: 'REFUND_NOT_PENDING', message: 'This refund was already resolved.' },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.refund.update({ where: { id: refundId }, data: { status: RefundStatus.COMPLETED } });

      const alreadyRefunded = await tx.refund.aggregate({
        where: { paymentId: refund.paymentId, status: RefundStatus.COMPLETED },
        _sum: { amount: true },
      });
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: refund.paymentId } });
      const totalRefunded = alreadyRefunded._sum.amount ?? new Prisma.Decimal(0);
      const isFullyRefunded = totalRefunded.gte(payment.amount);
      await tx.payment.update({
        where: { id: refund.paymentId },
        data: { status: isFullyRefunded ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED },
      });

      return updated;
    });
  }
}
