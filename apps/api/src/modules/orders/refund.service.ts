import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
}
