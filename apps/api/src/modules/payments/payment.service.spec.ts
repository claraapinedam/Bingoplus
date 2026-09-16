import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaymentService } from './payment.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentProvider } from './providers/payment-provider.interface';

describe('PaymentService', () => {
  let service: PaymentService;
  let prisma: any;
  let provider: any;

  beforeEach(() => {
    prisma = {
      payment: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      transaction: { create: jest.fn() },
      webhookEvent: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      refund: { create: jest.fn(), update: jest.fn(), aggregate: jest.fn() },
      $transaction: jest.fn((arg: any) =>
        Array.isArray(arg) ? Promise.all(arg) : arg(prisma),
      ),
    };
    provider = {
      name: 'sandbox',
      createPayment: jest.fn(),
      confirmPayment: jest.fn(),
      refundPayment: jest.fn(),
      verifyWebhookSignature: jest.fn(),
      parseWebhookEvent: jest.fn(),
    };
    service = new PaymentService(prisma as unknown as PrismaService, provider as unknown as PaymentProvider);
  });

  describe('createPayment (§21 idempotency)', () => {
    it('returns the existing Payment instead of creating a second one for a repeated idempotencyKey', async () => {
      prisma.payment.findUnique.mockResolvedValue({ id: 'pay-existing' });
      const result = await service.createPayment(prisma, { orderId: 'o1' }, new Prisma.Decimal(10), 'USD', 'idem-1');
      expect(result).toEqual({ id: 'pay-existing' });
      expect(provider.createPayment).not.toHaveBeenCalled();
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('calls the provider and persists a new Payment when the key is unseen', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      provider.createPayment.mockResolvedValue({ providerPaymentId: 'pp1', clientSecret: 'secret', status: 'PENDING' });
      prisma.payment.create.mockResolvedValue({ id: 'pay1', status: 'PENDING' });

      const result = await service.createPayment(prisma, { orderId: 'o1' }, new Prisma.Decimal(10), 'USD', 'idem-2');

      expect(provider.createPayment).toHaveBeenCalledWith({
        referenceId: 'o1',
        amount: new Prisma.Decimal(10),
        currency: 'USD',
        idempotencyKey: 'idem-2',
      });
      expect(result).toEqual({ id: 'pay1', status: 'PENDING' });
    });
  });

  describe('confirmPayment', () => {
    it('is idempotent — re-confirming an already-PAID payment never calls the provider again', async () => {
      prisma.payment.findUnique.mockResolvedValue({ id: 'pay1', status: 'PAID' });
      const result = await service.confirmPayment('pay1');
      expect(result.status).toBe('PAID');
      expect(provider.confirmPayment).not.toHaveBeenCalled();
    });

    it('updates Payment status and records a CHARGE transaction on confirmation', async () => {
      prisma.payment.findUnique.mockResolvedValue({ id: 'pay1', status: 'PENDING', providerPaymentId: 'pp1', amount: 10 });
      provider.confirmPayment.mockResolvedValue({ status: 'PAID' });
      prisma.payment.update.mockResolvedValue({ id: 'pay1', status: 'PAID' });

      await service.confirmPayment('pay1');

      expect(provider.confirmPayment).toHaveBeenCalledWith('pp1', undefined);
      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'CHARGE', paymentId: 'pay1' }) }),
      );
    });
  });

  describe('processWebhook (§22 idempotency + signature)', () => {
    it('rejects an unknown provider name', async () => {
      await expect(service.processWebhook('stripe', '{}', 'sig')).rejects.toThrow();
    });

    it('rejects a payload whose signature does not verify', async () => {
      provider.verifyWebhookSignature.mockReturnValue(false);
      await expect(service.processWebhook('sandbox', '{}', 'bad-sig')).rejects.toThrow();
    });

    it('processes a new event exactly once and updates the matching Payment', async () => {
      provider.verifyWebhookSignature.mockReturnValue(true);
      provider.parseWebhookEvent.mockReturnValue({
        externalEventId: 'evt_1',
        eventType: 'payment.paid',
        providerPaymentId: 'pp1',
        status: 'PAID',
      });
      prisma.webhookEvent.findUnique.mockResolvedValue(null);
      prisma.webhookEvent.create.mockResolvedValue({ id: 'we1' });
      prisma.payment.findFirst = jest.fn().mockResolvedValue({ id: 'pay1' });
      prisma.payment.update.mockResolvedValue({ id: 'pay1', orderId: 'o1', status: 'PAID' });

      const result = await service.processWebhook('sandbox', '{"externalEventId":"evt_1"}', 'sig');

      expect(result.duplicate).toBe(false);
      expect(result.payment).toEqual({ id: 'pay1', orderId: 'o1', status: 'PAID' });
      expect(prisma.webhookEvent.update).toHaveBeenCalledWith({
        where: { id: 'we1' },
        data: expect.objectContaining({ processed: true }),
      });
    });

    it('a redelivered event that was already processed is a no-op — never applies the Payment update twice', async () => {
      provider.verifyWebhookSignature.mockReturnValue(true);
      provider.parseWebhookEvent.mockReturnValue({
        externalEventId: 'evt_1',
        eventType: 'payment.paid',
        providerPaymentId: 'pp1',
        status: 'PAID',
      });
      prisma.webhookEvent.findUnique.mockResolvedValue({ id: 'we1', processed: true });

      const result = await service.processWebhook('sandbox', '{}', 'sig');

      expect(result.duplicate).toBe(true);
      expect(prisma.payment.update).not.toHaveBeenCalled();
    });
  });

  describe('admin — global payment supervision (§20), never exposing raw card data', () => {
    it('listForAdmin returns payments across every order', async () => {
      prisma.payment.count.mockResolvedValue(1);
      prisma.payment.findMany.mockResolvedValue([{ id: 'pay-1', order: { id: 'o1', orderNumber: 'ORD-1' }, refunds: [] }]);
      const result = await service.listForAdmin({});
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('getForAdmin 404s on an unknown payment', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      await expect(service.getForAdmin('ghost')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('listForAdmin scopes to one business when businessId is given, for the per-business admin hub', async () => {
      prisma.payment.count.mockResolvedValue(0);
      prisma.payment.findMany.mockResolvedValue([]);
      await service.listForAdmin({ businessId: 'biz-1' });
      const where = prisma.payment.count.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { order: { businessId: 'biz-1' } },
        { booking: { businessId: 'biz-1' } },
      ]);
    });
  });
});
