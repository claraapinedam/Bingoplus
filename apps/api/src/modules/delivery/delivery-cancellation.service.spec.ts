import { DeliveryStatus } from '@prisma/client';
import { DeliveryCancellationService } from './delivery-cancellation.service';
import { DeliveryStateMachine } from './delivery-state-machine';

describe('DeliveryCancellationService', () => {
  let service: DeliveryCancellationService;
  let prisma: any;
  let gateway: any;

  beforeEach(() => {
    prisma = {
      delivery: {
        findUnique: jest.fn().mockResolvedValue({ id: 'd1', status: DeliveryStatus.SEARCHING_RIDER, riderId: null }),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'd1', status: DeliveryStatus.CANCELLED }),
      },
      deliveryAssignmentHistory: { create: jest.fn() },
      rider: { update: jest.fn() },
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
    prisma.delivery.findUnique.mockResolvedValue({ id: 'd2', status: DeliveryStatus.RIDER_ASSIGNED, riderId: 'rider-1' });

    await service.cancel('d2', 'ADMIN');

    expect(prisma.rider.update).toHaveBeenCalledWith({ where: { id: 'rider-1' }, data: { availabilityStatus: 'AVAILABLE' } });
  });

  it('refuses to cancel a delivery that already reached a non-cancellable state', async () => {
    prisma.delivery.findUnique.mockResolvedValue({ id: 'd3', status: DeliveryStatus.DELIVERED, riderId: null });

    await expect(service.cancel('d3', 'ADMIN')).rejects.toThrow();
    expect(gateway.emitStatusUpdated).not.toHaveBeenCalled();
  });
});
