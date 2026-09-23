import { DeliveryStatus, Prisma } from '@prisma/client';
import { DeliveryCancellationService } from './delivery-cancellation.service';
import { DeliveryStateMachine } from './delivery-state-machine';

describe('DeliveryCancellationService', () => {
  let service: DeliveryCancellationService;
  let prisma: any;
  let gateway: any;

  beforeEach(() => {
    prisma = {
      delivery: {
        findUnique: jest.fn().mockResolvedValue({ id: 'd1', orderId: 'o1', status: DeliveryStatus.SEARCHING_RIDER, riderId: null }),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'd1', status: DeliveryStatus.CANCELLED }),
      },
      deliveryAssignmentHistory: { create: jest.fn() },
      rider: { update: jest.fn() },
      order: { findUnique: jest.fn().mockResolvedValue(null) },
      refund: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
        create: jest.fn(),
      },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };
    gateway = { emitStatusUpdated: jest.fn() };
    service = new DeliveryCancellationService(prisma, new DeliveryStateMachine(), gateway);
  });

  it('pushes a realtime delivery.status.updated event so the customer/business tracking screens update live — Order.status structurally never reflects this cancellation', async () => {
    await service.cancel('d1', 'ADMIN', 'Cliente pidió cancelar');

    expect(gateway.emitStatusUpdated).toHaveBeenCalledWith('d1', DeliveryStatus.CANCELLED);
  });

  it('frees the assigned rider back to AVAILABLE', async () => {
    prisma.delivery.findUnique.mockResolvedValue({ id: 'd2', orderId: 'o2', status: DeliveryStatus.RIDER_ASSIGNED, riderId: 'rider-1' });

    await service.cancel('d2', 'ADMIN');

    expect(prisma.rider.update).toHaveBeenCalledWith({ where: { id: 'rider-1' }, data: { availabilityStatus: 'AVAILABLE' } });
  });

  it('refuses to cancel a delivery that already reached a non-cancellable state', async () => {
    prisma.delivery.findUnique.mockResolvedValue({ id: 'd3', orderId: 'o3', status: DeliveryStatus.DELIVERED, riderId: null });

    await expect(service.cancel('d3', 'ADMIN')).rejects.toThrow();
    expect(gateway.emitStatusUpdated).not.toHaveBeenCalled();
  });

  it('creates a PENDING refund for the full paid amount when the order was already paid', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'o1',
      payment: { id: 'pay1', status: 'PAID', amount: new Prisma.Decimal(25.5) },
    });

    await service.cancel('d1', 'ADMIN');

    const call = prisma.refund.create.mock.calls[0][0].data;
    expect(call).toMatchObject({ paymentId: 'pay1', orderId: 'o1', reason: 'Entrega cancelada', requestedBy: 'ADMIN', status: 'PENDING' });
    expect((call.amount as Prisma.Decimal).toNumber()).toBe(25.5);
  });

  it('only creates a refund for the outstanding balance when part of the payment was already refunded', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'o1',
      payment: { id: 'pay1', status: 'PARTIALLY_REFUNDED', amount: new Prisma.Decimal(25.5) },
    });
    prisma.refund.aggregate.mockResolvedValue({ _sum: { amount: new Prisma.Decimal(10) } });

    await service.cancel('d1', 'ADMIN');

    const createdAmount: Prisma.Decimal = prisma.refund.create.mock.calls[0][0].data.amount;
    expect(createdAmount.toNumber()).toBe(15.5);
  });

  it('never creates a refund for an order that was never paid', async () => {
    prisma.order.findUnique.mockResolvedValue({ id: 'o1', payment: null });

    await service.cancel('d1', 'ADMIN');

    expect(prisma.refund.create).not.toHaveBeenCalled();
  });

  it('never creates a duplicate refund once the payment is already fully refunded', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'o1',
      payment: { id: 'pay1', status: 'PARTIALLY_REFUNDED', amount: new Prisma.Decimal(25.5) },
    });
    prisma.refund.aggregate.mockResolvedValue({ _sum: { amount: new Prisma.Decimal(25.5) } });

    await service.cancel('d1', 'ADMIN');

    expect(prisma.refund.create).not.toHaveBeenCalled();
  });
});
