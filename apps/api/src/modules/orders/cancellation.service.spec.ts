import { ForbiddenException } from '@nestjs/common';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { CancellationService } from './cancellation.service';
import { OrderStateMachine } from './order-state-machine';
import { PrismaService } from '../../prisma/prisma.service';
import { StockService } from '../pricing/stock.service';
import { RefundService } from './refund.service';

describe('CancellationService', () => {
  let service: CancellationService;
  let prisma: any;
  let stock: any;
  let refunds: any;
  const stateMachine = new OrderStateMachine();

  const baseOrder = {
    id: 'o1',
    userId: 'u1',
    businessId: 'b1',
    status: OrderStatus.CONFIRMED,
    items: [{ productId: 'p1', nameSnapshot: 'Dog Food', variantId: null, quantity: 2 }],
    payment: null,
  };

  beforeEach(() => {
    prisma = {
      order: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };
    stock = { releaseStock: jest.fn() };
    refunds = { refundOrder: jest.fn() };
    service = new CancellationService(
      prisma as unknown as PrismaService,
      stateMachine,
      stock as unknown as StockService,
      refunds as unknown as RefundService,
    );
  });

  describe('cancelByCustomer', () => {
    it('rejects a customer cancelling someone else\'s order', async () => {
      prisma.order.findUnique.mockResolvedValue(baseOrder);
      await expect(service.cancelByCustomer('someone-else', 'o1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects cancellation once the business has started PREPARING (§35)', async () => {
      prisma.order.findUnique.mockResolvedValue({ ...baseOrder, status: OrderStatus.PREPARING });
      await expect(service.cancelByCustomer('u1', 'o1')).rejects.toMatchObject({
        response: { error: { code: 'ORDER_NOT_CANCELLABLE' } },
      });
    });

    it('releases stock and marks CANCELLED when cancellation is allowed', async () => {
      prisma.order.findUnique.mockResolvedValue(baseOrder);
      prisma.order.findUniqueOrThrow.mockResolvedValue({ ...baseOrder, status: OrderStatus.CANCELLED });

      await service.cancelByCustomer('u1', 'o1', 'changed my mind');

      expect(stock.releaseStock).toHaveBeenCalledWith(prisma, [
        { productId: 'p1', productName: 'Dog Food', variantId: null, quantity: 2 },
      ]);
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: expect.objectContaining({ status: OrderStatus.CANCELLED, cancelReason: 'changed my mind' }),
      });
    });

    it('automatically refunds a cancelled order that was already PAID — never leaves the customer charged', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...baseOrder,
        payment: { id: 'pay1', status: PaymentStatus.PAID, amount: 25 },
      });
      prisma.order.findUniqueOrThrow.mockResolvedValue(baseOrder);

      await service.cancelByCustomer('u1', 'o1');

      expect(refunds.refundOrder).toHaveBeenCalledWith('o1', 25, 'Order cancelled');
    });

    it('does not attempt a refund when the order was never paid', async () => {
      prisma.order.findUnique.mockResolvedValue(baseOrder); // payment: null
      prisma.order.findUniqueOrThrow.mockResolvedValue(baseOrder);

      await service.cancelByCustomer('u1', 'o1');

      expect(refunds.refundOrder).not.toHaveBeenCalled();
    });
  });

  describe('cancelByBusiness', () => {
    it('rejects a business cancelling an order that is not theirs', async () => {
      prisma.order.findUnique.mockResolvedValue(baseOrder);
      await expect(service.cancelByBusiness('other-business', 'o1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('a business is not restricted by the customer-only PREPARING cutoff for a normally-cancellable status', async () => {
      prisma.order.findUnique.mockResolvedValue({ ...baseOrder, status: OrderStatus.PAID });
      prisma.order.findUniqueOrThrow.mockResolvedValue({ ...baseOrder, status: OrderStatus.CANCELLED });
      await expect(service.cancelByBusiness('b1', 'o1')).resolves.toBeDefined();
    });
  });
});
