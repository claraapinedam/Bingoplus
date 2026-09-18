import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FulfillmentType, OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';
import { OrderStateMachine } from './order-state-machine';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notifications/notification.service';

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: any;
  let stateMachine: OrderStateMachine;
  let notifications: any;

  const baseOrder = { id: 'o1', businessId: 'b1', status: OrderStatus.PAID, fulfillmentType: FulfillmentType.PICKUP };

  beforeEach(() => {
    prisma = {
      order: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn((ops: any) => Promise.all(ops)),
    };
    stateMachine = new OrderStateMachine();
    notifications = { notify: jest.fn().mockResolvedValue(undefined) };
    service = new OrdersService(prisma as unknown as PrismaService, stateMachine, notifications as unknown as NotificationService);
  });

  describe('admin — global read-only supervision (§12), never a second state machine', () => {
    it('listForAdmin paginates across every business, not just one', async () => {
      prisma.order.count.mockResolvedValue(2);
      prisma.order.findMany.mockResolvedValue([baseOrder, { ...baseOrder, id: 'o2', businessId: 'b2' }]);

      const result = await service.listForAdmin({});

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(prisma.order.findMany.mock.calls[0][0].where.businessId).toBeUndefined();
    });

    it('listForAdmin can still narrow to one business via businessId', async () => {
      await service.listForAdmin({ businessId: 'b1' });
      expect(prisma.order.findMany.mock.calls[0][0].where).toMatchObject({ businessId: 'b1' });
    });

    it('listForAdmin leaves createdAt unbounded when no from/to is given', async () => {
      await service.listForAdmin({});
      expect(prisma.order.findMany.mock.calls[0][0].where.createdAt).toBeUndefined();
    });

    it('listForAdmin narrows to a date range when from/to are given', async () => {
      await service.listForAdmin({ from: '2026-01-01', to: '2026-01-31' });
      const { createdAt } = prisma.order.findMany.mock.calls[0][0].where;
      expect(createdAt.gte.toISOString()).toBe(new Date(2026, 0, 1, 0, 0, 0, 0).toISOString());
      expect(createdAt.lte.toISOString()).toBe(new Date(2026, 0, 31, 23, 59, 59, 999).toISOString());
    });

    it('listForAdmin respects an exact hour range when a full datetime is given', async () => {
      await service.listForAdmin({ from: '2026-01-01T14:00', to: '2026-01-01T18:00' });
      const { createdAt } = prisma.order.findMany.mock.calls[0][0].where;
      expect(createdAt.gte.toISOString()).toBe(new Date(2026, 0, 1, 14, 0, 0, 0).toISOString());
      expect(createdAt.lte.toISOString()).toBe(new Date(2026, 0, 1, 18, 0, 0, 0).toISOString());
    });

    it('getForAdmin 404s on an unknown order — same as every other getForX', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      await expect(service.getForAdmin('ghost')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('getForAdmin does not enforce ownership — that is the whole point of admin visibility', async () => {
      prisma.order.findUnique.mockResolvedValue({ ...baseOrder, userId: 'someone-else' });
      await expect(service.getForAdmin('o1')).resolves.toBeTruthy();
    });
  });

  describe('updateStatusForBusiness — §Parte 6 concurrency', () => {
    it('applies the transition via a status-guarded updateMany, not a plain update', async () => {
      prisma.order.findUnique.mockResolvedValue(baseOrder);
      prisma.order.updateMany.mockResolvedValue({ count: 1 });
      prisma.order.findUniqueOrThrow.mockResolvedValue({ ...baseOrder, status: OrderStatus.CONFIRMED });

      await service.updateStatusForBusiness('b1', 'o1', OrderStatus.CONFIRMED);

      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { id: 'o1', status: OrderStatus.PAID },
        data: { status: OrderStatus.CONFIRMED },
      });
    });

    it('throws ORDER_ALREADY_UPDATED (not a silent success) when the guard matches zero rows', async () => {
      prisma.order.findUnique.mockResolvedValue(baseOrder);
      prisma.order.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.updateStatusForBusiness('b1', 'o1', OrderStatus.CONFIRMED)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects a status the business cannot set directly', async () => {
      prisma.order.findUnique.mockResolvedValue(baseOrder);
      await expect(service.updateStatusForBusiness('b1', 'o1', OrderStatus.PAID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it('blocks a DELIVERY order from reaching READY_FOR_PICKUP via the generic PATCH', async () => {
      prisma.order.findUnique.mockResolvedValue({ ...baseOrder, status: OrderStatus.PREPARING, fulfillmentType: FulfillmentType.DELIVERY });
      await expect(
        service.updateStatusForBusiness('b1', 'o1', OrderStatus.READY_FOR_PICKUP),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a business acting on an order that is not theirs', async () => {
      prisma.order.findUnique.mockResolvedValue({ ...baseOrder, businessId: 'other-business' });
      await expect(service.updateStatusForBusiness('b1', 'o1', OrderStatus.CONFIRMED)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('setReadyForPickup — §Parte 6 concurrency', () => {
    it('also uses the guarded transition, not a plain update', async () => {
      prisma.order.findUnique.mockResolvedValue({ ...baseOrder, status: OrderStatus.PREPARING });
      prisma.order.updateMany.mockResolvedValue({ count: 1 });
      prisma.order.findUniqueOrThrow.mockResolvedValue({ ...baseOrder, status: OrderStatus.READY_FOR_PICKUP });

      await service.setReadyForPickup('b1', 'o1');

      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { id: 'o1', status: OrderStatus.PREPARING },
        data: { status: OrderStatus.READY_FOR_PICKUP },
      });
    });

    it('throws on a repeat call once the order already left PREPARING', async () => {
      prisma.order.findUnique.mockResolvedValue({ ...baseOrder, status: OrderStatus.READY_FOR_PICKUP });
      await expect(service.setReadyForPickup('b1', 'o1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });
  });
});
