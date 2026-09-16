import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderStateMachine } from './order-state-machine';
import { StockService } from '../pricing/stock.service';
import { RefundService } from './refund.service';

/**
 * §35: centralizes the one cancellation rule — a customer can cancel before the business starts
 * PREPARING; after that, cancellation is a business-initiated action. Both paths release stock
 * and, if the order was already paid, kick off a full refund automatically — leaving a customer
 * charged for a cancelled order would defeat the entire point of having Refund architecture.
 */
@Injectable()
export class CancellationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: OrderStateMachine,
    private readonly stock: StockService,
    private readonly refunds: RefundService,
  ) {}

  async cancelByCustomer(userId: string, orderId: string, reason?: string) {
    const order = await this.loadOrder(orderId);
    if (order.userId !== userId) throw new ForbiddenException('Not your order');
    if (!this.stateMachine.isCustomerCancellable(order.status)) {
      throw new BadRequestException({
        error: {
          code: 'ORDER_NOT_CANCELLABLE',
          message: 'This order can no longer be cancelled by the customer — it is already being prepared.',
        },
      });
    }
    return this.cancel(order, reason);
  }

  async cancelByBusiness(businessId: string, orderId: string, reason?: string) {
    const order = await this.loadOrder(orderId);
    if (order.businessId !== businessId) throw new ForbiddenException('Not your order');
    return this.cancel(order, reason);
  }

  private async loadOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, payment: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private async cancel(order: Awaited<ReturnType<CancellationService['loadOrder']>>, reason?: string) {
    this.stateMachine.assertTransition(order.status, OrderStatus.CANCELLED);

    await this.prisma.$transaction(async (tx) => {
      await this.stock.releaseStock(
        tx,
        order.items.map((i) => ({
          productId: i.productId,
          productName: i.nameSnapshot,
          variantId: i.variantId,
          quantity: i.quantity,
        })),
      );
      await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.CANCELLED, cancelReason: reason, cancelledAt: new Date() },
      });
    });

    if (order.payment && order.payment.status === PaymentStatus.PAID) {
      await this.refunds.refundOrder(order.id, order.payment.amount, reason ?? 'Order cancelled');
    }

    return this.prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true, payment: true } });
  }
}
