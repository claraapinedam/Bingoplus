import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BookingStatus, FulfillmentType, OrderStatus, Prisma, ReviewStatus, ReviewTargetType } from '@prisma/client';
import { ReviewsService } from './reviews.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notifications/notification.service';

describe('ReviewsService', () => {
  let service: ReviewsService;
  let prisma: any;
  let notifications: any;

  const completedDeliveryOrder = { id: 'o1', userId: 'u1', businessId: 'b1', status: OrderStatus.COMPLETED, fulfillmentType: FulfillmentType.DELIVERY };
  const completedPickupOrder = { ...completedDeliveryOrder, fulfillmentType: FulfillmentType.PICKUP };
  const completedBooking = { id: 'bk1', userId: 'u1', serviceId: 'svc1', status: BookingStatus.COMPLETED };

  beforeEach(() => {
    prisma = {
      order: { findUnique: jest.fn() },
      orderItem: { findMany: jest.fn().mockResolvedValue([]) },
      booking: { findUnique: jest.fn() },
      delivery: { findUnique: jest.fn() },
      review: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        update: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 4.5 }, _count: { rating: 2 } }),
        count: jest.fn().mockResolvedValue(0),
      },
      reviewReport: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      business: { update: jest.fn(), findUnique: jest.fn().mockResolvedValue({ ownerId: 'owner-1', tradeName: 'Biz' }) },
      rider: { update: jest.fn() },
      product: { update: jest.fn(), findUnique: jest.fn() },
      service: { update: jest.fn(), findUnique: jest.fn().mockResolvedValue({ name: 'Consulta', business: { ownerId: 'owner-1' } }) },
      $transaction: jest.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
    };
    notifications = { notify: jest.fn().mockResolvedValue(undefined) };
    service = new ReviewsService(prisma as unknown as PrismaService, notifications as unknown as NotificationService);
  });

  describe('submitForOrder', () => {
    it('rejects a submission with neither rating', async () => {
      await expect(service.submitForOrder('u1', 'o1', {})).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.order.findUnique).not.toHaveBeenCalled();
    });

    it("rejects rating an order that is not the caller's", async () => {
      prisma.order.findUnique.mockResolvedValue({ ...completedDeliveryOrder, userId: 'someone-else' });
      await expect(service.submitForOrder('u1', 'o1', { business: { rating: 5 } })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects rating an order that is not yet COMPLETED', async () => {
      prisma.order.findUnique.mockResolvedValue({ ...completedDeliveryOrder, status: OrderStatus.PREPARING });
      await expect(service.submitForOrder('u1', 'o1', { business: { rating: 5 } })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects rating a rider on a PICKUP order (no delivery, no rider)', async () => {
      prisma.order.findUnique.mockResolvedValue(completedPickupOrder);
      await expect(service.submitForOrder('u1', 'o1', { rider: { rating: 5 } })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a product that was not part of the order', async () => {
      prisma.order.findUnique.mockResolvedValue(completedDeliveryOrder);
      prisma.orderItem.findMany.mockResolvedValue([{ productId: 'p1' }]);
      await expect(
        service.submitForOrder('u1', 'o1', { products: [{ productId: 'p-not-in-order', rating: 5 }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates both reviews and recomputes both aggregates in one transaction', async () => {
      prisma.order.findUnique.mockResolvedValue(completedDeliveryOrder);
      prisma.delivery.findUnique.mockResolvedValue({ riderId: 'r1' });
      prisma.review.create = jest.fn().mockResolvedValue({});

      await service.submitForOrder('u1', 'o1', { business: { rating: 5, comment: 'Genial' }, rider: { rating: 4 } });

      expect(prisma.review.create).toHaveBeenCalledTimes(2);
      expect(prisma.business.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { ratingAvg: 4.5, reviewCount: 2 } });
      expect(prisma.rider.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { ratingAvg: 4.5, reviewCount: 2 } });
    });

    it('creates a product review and recomputes the product aggregate', async () => {
      prisma.order.findUnique.mockResolvedValue(completedDeliveryOrder);
      prisma.orderItem.findMany.mockResolvedValue([{ productId: 'p1' }]);
      prisma.review.create = jest.fn().mockResolvedValue({});

      await service.submitForOrder('u1', 'o1', { products: [{ productId: 'p1', rating: 5 }] });

      expect(prisma.review.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ targetType: ReviewTargetType.PRODUCT, targetId: 'p1' }) }),
      );
      expect(prisma.product.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { ratingAvg: 4.5, reviewCount: 2 } });
    });

    it('turns a unique-constraint violation into a clean ALREADY_REVIEWED error, not a 500', async () => {
      prisma.order.findUnique.mockResolvedValue(completedDeliveryOrder);
      prisma.delivery.findUnique.mockResolvedValue({ riderId: 'r1' });
      prisma.review.create = jest
        .fn()
        .mockRejectedValue(new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '5.22.0' }));

      await expect(service.submitForOrder('u1', 'o1', { business: { rating: 5 } })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getContextForOrder', () => {
    it('reports no rider for a PICKUP order', async () => {
      prisma.order.findUnique.mockResolvedValue(completedPickupOrder);
      const result = await service.getContextForOrder('u1', 'o1');
      expect(result.rider).toBeNull();
      expect(result.eligible).toBe(true);
    });

    it('reports eligible=false before the order is COMPLETED', async () => {
      prisma.order.findUnique.mockResolvedValue({ ...completedPickupOrder, status: OrderStatus.PREPARING });
      const result = await service.getContextForOrder('u1', 'o1');
      expect(result.eligible).toBe(false);
    });
  });

  describe('submitForBooking — Service reviews (§3.1/3.2 FASE 8)', () => {
    it("rejects rating a booking that is not the caller's", async () => {
      prisma.booking.findUnique.mockResolvedValue({ ...completedBooking, userId: 'someone-else' });
      await expect(service.submitForBooking('u1', 'bk1', { rating: 5 })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects rating a booking that is not yet COMPLETED', async () => {
      prisma.booking.findUnique.mockResolvedValue({ ...completedBooking, status: BookingStatus.CONFIRMED });
      await expect(service.submitForBooking('u1', 'bk1', { rating: 5 })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates a SERVICE review and recomputes the service aggregate', async () => {
      prisma.booking.findUnique.mockResolvedValue(completedBooking);
      prisma.review.create = jest.fn().mockResolvedValue({});

      await service.submitForBooking('u1', 'bk1', { rating: 5, comment: 'Excelente' });

      expect(prisma.review.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ targetType: ReviewTargetType.SERVICE, targetId: 'svc1', bookingId: 'bk1' }) }),
      );
      expect(prisma.service.update).toHaveBeenCalledWith({ where: { id: 'svc1' }, data: { ratingAvg: 4.5, reviewCount: 2 } });
    });

    it('turns a duplicate booking review into ALREADY_REVIEWED, not a 500', async () => {
      prisma.booking.findUnique.mockResolvedValue(completedBooking);
      prisma.review.create = jest
        .fn()
        .mockRejectedValue(new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '5.22.0' }));
      await expect(service.submitForBooking('u1', 'bk1', { rating: 5 })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('reply — business ownership', () => {
    it('rejects a reply from a business that does not own the reviewed Business target', async () => {
      prisma.review.findUnique.mockResolvedValue({ id: 'rv1', targetType: ReviewTargetType.BUSINESS, targetId: 'other-biz' });
      await expect(service.reply('biz-1', 'rv1', { reply: 'Gracias' })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects a reply to a SERVICE review from a business that does not own the service', async () => {
      prisma.review.findUnique.mockResolvedValue({ id: 'rv1', targetType: ReviewTargetType.SERVICE, targetId: 'svc1' });
      prisma.service.findUnique.mockResolvedValue({ businessId: 'other-biz' });
      await expect(service.reply('biz-1', 'rv1', { reply: 'Gracias' })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows a reply when the business owns the reviewed target', async () => {
      prisma.review.findUnique.mockResolvedValue({ id: 'rv1', targetType: ReviewTargetType.BUSINESS, targetId: 'biz-1' });
      prisma.review.update.mockResolvedValue({ id: 'rv1', businessReply: 'Gracias' });
      await service.reply('biz-1', 'rv1', { reply: 'Gracias' });
      expect(prisma.review.update).toHaveBeenCalledWith({
        where: { id: 'rv1' },
        data: expect.objectContaining({ businessReply: 'Gracias' }),
      });
    });
  });

  describe('report', () => {
    it('404s reporting an unknown review', async () => {
      prisma.review.findUnique.mockResolvedValue(null);
      await expect(service.report('u1', 'ghost', { reason: 'spam' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('creates a report and flags the review for triage', async () => {
      prisma.review.findUnique.mockResolvedValue({ id: 'rv1' });
      prisma.reviewReport.create.mockResolvedValue({ id: 'rep1' });
      await service.report('u1', 'rv1', { reason: 'Contenido ofensivo' });
      expect(prisma.reviewReport.create).toHaveBeenCalledWith({ data: { reviewId: 'rv1', reportedBy: 'u1', reason: 'Contenido ofensivo' } });
      expect(prisma.review.update).toHaveBeenCalledWith({ where: { id: 'rv1' }, data: { status: ReviewStatus.FLAGGED } });
    });
  });

  describe('admin moderation', () => {
    it('hide recomputes the aggregate excluding the now-hidden review', async () => {
      prisma.review.findUnique.mockResolvedValue({ id: 'rv1', targetType: ReviewTargetType.BUSINESS, targetId: 'b1' });
      await service.hide('rv1');
      expect(prisma.review.update).toHaveBeenCalledWith({ where: { id: 'rv1' }, data: { status: ReviewStatus.HIDDEN } });
      expect(prisma.business.update).toHaveBeenCalled();
    });

    it('404s hiding an unknown review', async () => {
      prisma.review.findUnique.mockResolvedValue(null);
      await expect(service.hide('ghost')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('listForAdmin paginates across every review', async () => {
      prisma.review.count.mockResolvedValue(1);
      prisma.review.findMany.mockResolvedValue([{ id: 'rv1' }]);
      const result = await service.listForAdmin({});
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });
});
