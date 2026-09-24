import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DeliveryChatSenderType, DeliveryStatus } from '@prisma/client';
import { DeliveryChatService } from './delivery-chat.service';
import { DeliveryStateMachine } from './delivery-state-machine';
import { PrismaService } from '../../prisma/prisma.service';
import { DeliveryGateway } from './delivery.gateway';

describe('DeliveryChatService', () => {
  let service: DeliveryChatService;
  let prisma: any;
  let gateway: any;

  beforeEach(() => {
    prisma = {
      delivery: { findUnique: jest.fn() },
      deliveryChatMessage: { create: jest.fn(), findMany: jest.fn() },
    };
    gateway = { emitChatMessage: jest.fn() };
    service = new DeliveryChatService(prisma as unknown as PrismaService, new DeliveryStateMachine(), gateway as unknown as DeliveryGateway);
  });

  function delivery(overrides: Partial<{ riderId: string | null; status: DeliveryStatus; orderUserId: string }> = {}) {
    return {
      id: 'd1',
      riderId: 'riderId' in overrides ? overrides.riderId : 'rider1',
      status: overrides.status ?? DeliveryStatus.GOING_TO_PICKUP,
      order: { userId: overrides.orderUserId ?? 'customer1' },
    };
  }

  describe('sendForRider — ownership + open checks', () => {
    it('rejects a delivery that does not exist', async () => {
      prisma.delivery.findUnique.mockResolvedValue(null);
      await expect(service.sendForRider('rider1', 'u1', 'd1', 'hola')).rejects.toBeInstanceOf(NotFoundException);
    });

    it("rejects a rider sending into a delivery that isn't assigned to them", async () => {
      prisma.delivery.findUnique.mockResolvedValue(delivery({ riderId: 'someone-else' }));
      await expect(service.sendForRider('rider1', 'u1', 'd1', 'hola')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.deliveryChatMessage.create).not.toHaveBeenCalled();
    });

    it('rejects a rider whose own id can never match a null riderId (ownership check wins first)', async () => {
      // Unlike the customer path, a rider can never legitimately "own" a delivery with no rider
      // assigned yet — the ownership check (delivery.riderId === this rider's id) already fails
      // before assertOpen's own "no rider assigned" branch would even be reached.
      prisma.delivery.findUnique.mockResolvedValue(delivery({ riderId: null }));
      await expect(service.sendForRider('rider1', 'u1', 'd1', 'hola')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it.each([DeliveryStatus.DELIVERED, DeliveryStatus.CANCELLED, DeliveryStatus.FAILED])(
      'rejects sending once the delivery is %s (terminal)',
      async (status) => {
        prisma.delivery.findUnique.mockResolvedValue(delivery({ status }));
        await expect(service.sendForRider('rider1', 'u1', 'd1', 'hola')).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.deliveryChatMessage.create).not.toHaveBeenCalled();
      },
    );

    it('persists and emits a RIDER message when active and assigned', async () => {
      prisma.delivery.findUnique.mockResolvedValue(delivery());
      prisma.deliveryChatMessage.create.mockResolvedValue({ id: 'm1', deliveryId: 'd1', senderType: DeliveryChatSenderType.RIDER, text: 'hola' });
      const result = await service.sendForRider('rider1', 'u1', 'd1', 'hola');
      expect(prisma.deliveryChatMessage.create).toHaveBeenCalledWith({
        data: { deliveryId: 'd1', senderType: DeliveryChatSenderType.RIDER, senderUserId: 'u1', text: 'hola' },
      });
      expect(gateway.emitChatMessage).toHaveBeenCalledWith('d1', result);
    });
  });

  describe('sendForCustomer — ownership + open checks', () => {
    it("rejects a customer sending into someone else's order", async () => {
      prisma.delivery.findUnique.mockResolvedValue(delivery({ orderUserId: 'someone-else' }));
      await expect(service.sendForCustomer('customer1', 'd1', 'hola')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.deliveryChatMessage.create).not.toHaveBeenCalled();
    });

    it('rejects sending before a rider is assigned', async () => {
      prisma.delivery.findUnique.mockResolvedValue(delivery({ riderId: null }));
      await expect(service.sendForCustomer('customer1', 'd1', 'hola')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects sending once the delivery is DELIVERED (chat closes on completion)', async () => {
      prisma.delivery.findUnique.mockResolvedValue(delivery({ status: DeliveryStatus.DELIVERED }));
      await expect(service.sendForCustomer('customer1', 'd1', 'hola')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.deliveryChatMessage.create).not.toHaveBeenCalled();
    });

    it('persists and emits a CUSTOMER message when active and assigned', async () => {
      prisma.delivery.findUnique.mockResolvedValue(delivery());
      prisma.deliveryChatMessage.create.mockResolvedValue({ id: 'm2', deliveryId: 'd1', senderType: DeliveryChatSenderType.CUSTOMER, text: 'hola rider' });
      const result = await service.sendForCustomer('customer1', 'd1', 'hola rider');
      expect(prisma.deliveryChatMessage.create).toHaveBeenCalledWith({
        data: { deliveryId: 'd1', senderType: DeliveryChatSenderType.CUSTOMER, senderUserId: 'customer1', text: 'hola rider' },
      });
      expect(gateway.emitChatMessage).toHaveBeenCalledWith('d1', result);
    });
  });

  describe('listForRider / listForCustomer', () => {
    it("never leaks another rider's delivery chat", async () => {
      prisma.delivery.findUnique.mockResolvedValue(delivery({ riderId: 'someone-else' }));
      await expect(service.listForRider('rider1', 'd1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.deliveryChatMessage.findMany).not.toHaveBeenCalled();
    });

    it("never leaks another customer's delivery chat", async () => {
      prisma.delivery.findUnique.mockResolvedValue(delivery({ orderUserId: 'someone-else' }));
      await expect(service.listForCustomer('customer1', 'd1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.deliveryChatMessage.findMany).not.toHaveBeenCalled();
    });

    it('lists history even once the delivery is terminal (read-only, never write)', async () => {
      prisma.delivery.findUnique.mockResolvedValue(delivery({ status: DeliveryStatus.DELIVERED }));
      prisma.deliveryChatMessage.findMany.mockResolvedValue([{ id: 'm1' }]);
      const result = await service.listForRider('rider1', 'd1');
      expect(result).toEqual([{ id: 'm1' }]);
    });

    it('filters by createdAt when a cursor is given', async () => {
      prisma.delivery.findUnique.mockResolvedValue(delivery());
      prisma.deliveryChatMessage.findMany.mockResolvedValue([]);
      await service.listForCustomer('customer1', 'd1', '2026-01-01T00:00:00.000Z');
      expect(prisma.deliveryChatMessage.findMany.mock.calls[0][0].where).toEqual({
        deliveryId: 'd1',
        createdAt: { gt: new Date('2026-01-01T00:00:00.000Z') },
      });
    });
  });
});
