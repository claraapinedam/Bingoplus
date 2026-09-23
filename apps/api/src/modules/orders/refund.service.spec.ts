import { Prisma } from '@prisma/client';
import { RefundService } from './refund.service';

describe('RefundService.completeManual', () => {
  let service: RefundService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      refund: {
        findUnique: jest.fn().mockResolvedValue({ id: 'r1', status: 'PENDING', paymentId: 'pay1' }),
        update: jest.fn().mockResolvedValue({ id: 'r1', status: 'COMPLETED' }),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: new Prisma.Decimal(25.5) } }),
      },
      payment: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'pay1', amount: new Prisma.Decimal(25.5) }),
        update: jest.fn(),
      },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };
    service = new RefundService(prisma, {} as any);
  });

  it('marks a PENDING refund COMPLETED and the payment fully REFUNDED once its total matches what was paid', async () => {
    await service.completeManual('r1');

    expect(prisma.refund.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { status: 'COMPLETED' } });
    expect(prisma.payment.update).toHaveBeenCalledWith({ where: { id: 'pay1' }, data: { status: 'REFUNDED' } });
  });

  it('marks the payment only PARTIALLY_REFUNDED when the completed total is still less than what was paid', async () => {
    prisma.refund.aggregate.mockResolvedValue({ _sum: { amount: new Prisma.Decimal(10) } });

    await service.completeManual('r1');

    expect(prisma.payment.update).toHaveBeenCalledWith({ where: { id: 'pay1' }, data: { status: 'PARTIALLY_REFUNDED' } });
  });

  it('refuses to complete a refund that is not PENDING', async () => {
    prisma.refund.findUnique.mockResolvedValue({ id: 'r2', status: 'COMPLETED', paymentId: 'pay1' });

    await expect(service.completeManual('r2')).rejects.toThrow();
    expect(prisma.refund.update).not.toHaveBeenCalled();
  });

  it('throws when the refund does not exist', async () => {
    prisma.refund.findUnique.mockResolvedValue(null);

    await expect(service.completeManual('missing')).rejects.toThrow();
  });
});
