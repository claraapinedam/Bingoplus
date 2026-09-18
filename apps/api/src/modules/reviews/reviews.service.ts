import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BookingStatus,
  FulfillmentType,
  NotificationAudience,
  OrderStatus,
  PetFriendlyPlaceStatus,
  Prisma,
  ReviewReportStatus,
  ReviewStatus,
  ReviewTargetType,
} from '@prisma/client';
import { resolvePagination } from '@bingoplus/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { CreateOrderReviewsDto } from './dto/create-order-reviews.dto';
import { CreateBookingReviewDto } from './dto/create-booking-review.dto';
import { ReportReviewDto } from './dto/report-review.dto';
import { BusinessReplyDto } from './dto/business-reply.dto';
import { ResolveReportDto } from './dto/moderate-review.dto';

type ReviewSummary = { targetType: ReviewTargetType; targetId: string; rating: number; comment: string | null };

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  // ── Order-based reviews (Business/Rider/Product) ───────────────────────────

  /** What the "rate your order" screen needs: whether there's a rider to rate at all, and
   * whatever this customer has already submitted for this order (so a resubmit shows as
   * read-only instead of a blank form). */
  async getContextForOrder(userId: string, orderId: string) {
    const order = await this.getOwnedOrder(userId, orderId);

    const delivery =
      order.fulfillmentType === FulfillmentType.DELIVERY
        ? await this.prisma.delivery.findUnique({ where: { orderId }, include: { rider: { include: { user: true } } } })
        : null;

    const items = await this.prisma.orderItem.findMany({ where: { orderId }, select: { productId: true, nameSnapshot: true } });

    const reviews = await this.prisma.review.findMany({
      where: { authorId: userId, orderId },
      select: { targetType: true, targetId: true, rating: true, comment: true },
    });

    return {
      eligible: order.status === OrderStatus.COMPLETED,
      rider: delivery?.rider ? { id: delivery.rider.id, firstName: delivery.rider.user.firstName } : null,
      products: items.map((i) => ({ id: i.productId, name: i.nameSnapshot })),
      reviews: reviews as ReviewSummary[],
    };
  }

  async submitForOrder(userId: string, orderId: string, dto: CreateOrderReviewsDto) {
    if (!dto.rider && !dto.business && !dto.products?.length) {
      throw new BadRequestException({
        error: { code: 'NO_RATING_PROVIDED', message: 'Provide a rating for the rider, the business, at least one product, or a combination.' },
      });
    }

    const order = await this.getOwnedOrder(userId, orderId);
    if (order.status !== OrderStatus.COMPLETED) {
      throw new BadRequestException({
        error: { code: 'ORDER_NOT_COMPLETED', message: 'You can only rate an order once it has been delivered or picked up.' },
      });
    }

    let riderId: string | null = null;
    if (dto.rider) {
      const delivery = order.fulfillmentType === FulfillmentType.DELIVERY ? await this.prisma.delivery.findUnique({ where: { orderId } }) : null;
      if (!delivery?.riderId) {
        throw new BadRequestException({ error: { code: 'NO_RIDER_TO_RATE', message: 'This order has no delivery rider to rate.' } });
      }
      riderId = delivery.riderId;
    }

    let productIds: string[] = [];
    if (dto.products?.length) {
      const items = await this.prisma.orderItem.findMany({ where: { orderId }, select: { productId: true } });
      const validIds = new Set(items.map((i) => i.productId));
      productIds = dto.products.map((p) => p.productId);
      const invalid = productIds.filter((id) => !validIds.has(id));
      if (invalid.length > 0) {
        throw new BadRequestException({
          error: { code: 'PRODUCT_NOT_IN_ORDER', message: 'One or more products were not part of this order.', details: { productIds: invalid } },
        });
      }
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        if (dto.business) {
          await tx.review.create({
            data: {
              authorId: userId,
              targetType: ReviewTargetType.BUSINESS,
              targetId: order.businessId,
              orderId,
              rating: dto.business.rating,
              comment: dto.business.comment,
            },
          });
          await this.recomputeAggregate(tx, ReviewTargetType.BUSINESS, order.businessId);
        }
        if (riderId) {
          await tx.review.create({
            data: {
              authorId: userId,
              targetType: ReviewTargetType.RIDER,
              targetId: riderId,
              orderId,
              rating: dto.rider!.rating,
              comment: dto.rider!.comment,
            },
          });
          await this.recomputeAggregate(tx, ReviewTargetType.RIDER, riderId);
        }
        for (const p of dto.products ?? []) {
          await tx.review.create({
            data: {
              authorId: userId,
              targetType: ReviewTargetType.PRODUCT,
              targetId: p.productId,
              orderId,
              rating: p.rating,
              comment: p.comment,
            },
          });
          await this.recomputeAggregate(tx, ReviewTargetType.PRODUCT, p.productId);
        }
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException({ error: { code: 'ALREADY_REVIEWED', message: 'You already rated this order.' } });
      }
      throw err;
    }

    if (dto.business) {
      const business = await this.prisma.business.findUnique({ where: { id: order.businessId }, select: { ownerId: true, tradeName: true } });
      if (business) {
        void this.notifications.notify({
          userId: business.ownerId,
          audience: NotificationAudience.BUSINESS,
          event: 'review.created',
          title: 'Nueva reseña',
          body: `Tu negocio recibió una nueva reseña de ${dto.business.rating}★.`,
          entityType: 'Business',
          entityId: order.businessId,
          idempotencyKey: `review-created:${userId}:BUSINESS:${order.businessId}:${orderId}`,
        });
      }
    }

    return this.getContextForOrder(userId, orderId);
  }

  // ── Booking-based reviews (Service) ─────────────────────────────────────

  async getContextForBooking(userId: string, bookingId: string) {
    const booking = await this.getOwnedBooking(userId, bookingId);
    const review = await this.prisma.review.findFirst({
      where: { authorId: userId, targetType: ReviewTargetType.SERVICE, targetId: booking.serviceId, bookingId },
      select: { targetType: true, targetId: true, rating: true, comment: true },
    });
    return {
      eligible: booking.status === BookingStatus.COMPLETED,
      service: { id: booking.serviceId },
      review: review as ReviewSummary | null,
    };
  }

  async submitForBooking(userId: string, bookingId: string, dto: CreateBookingReviewDto) {
    const booking = await this.getOwnedBooking(userId, bookingId);
    if (booking.status !== BookingStatus.COMPLETED) {
      throw new BadRequestException({
        error: { code: 'BOOKING_NOT_COMPLETED', message: 'You can only rate a booking once the service has been completed.' },
      });
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.review.create({
          data: {
            authorId: userId,
            targetType: ReviewTargetType.SERVICE,
            targetId: booking.serviceId,
            bookingId,
            rating: dto.rating,
            comment: dto.comment,
          },
        });
        await this.recomputeAggregate(tx, ReviewTargetType.SERVICE, booking.serviceId);
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException({ error: { code: 'ALREADY_REVIEWED', message: 'You already rated this booking.' } });
      }
      throw err;
    }

    const service = await this.prisma.service.findUnique({ where: { id: booking.serviceId }, select: { name: true, business: { select: { ownerId: true } } } });
    if (service) {
      void this.notifications.notify({
        userId: service.business.ownerId,
        audience: NotificationAudience.BUSINESS,
        event: 'review.created',
        title: 'Nueva reseña',
        body: `"${service.name}" recibió una nueva reseña de ${dto.rating}★.`,
        entityType: 'Service',
        entityId: booking.serviceId,
        idempotencyKey: `review-created:${userId}:SERVICE:${booking.serviceId}:${bookingId}`,
      });
    }

    return this.getContextForBooking(userId, bookingId);
  }

  // ── Pet-friendly-place reviews — no order/booking context, any user may rate any APPROVED
  // place once (guarded by the partial unique index on Review, not the orderId/bookingId-based
  // @@unique constraints, since both are always null here). ────────────────────────────────

  async listPublishedForPlace(placeId: string) {
    return this.prisma.review.findMany({
      where: { targetType: ReviewTargetType.PET_FRIENDLY_PLACE, targetId: placeId, status: ReviewStatus.PUBLISHED },
      orderBy: { createdAt: 'desc' },
      include: { author: { select: { firstName: true, lastName: true } } },
    });
  }

  async submitForPlace(userId: string, placeId: string, dto: CreateBookingReviewDto) {
    const place = await this.prisma.petFriendlyPlace.findUnique({ where: { id: placeId } });
    if (!place || place.status !== PetFriendlyPlaceStatus.APPROVED) {
      throw new NotFoundException('Pet-friendly place not found');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.review.create({
          data: {
            authorId: userId,
            targetType: ReviewTargetType.PET_FRIENDLY_PLACE,
            targetId: placeId,
            rating: dto.rating,
            comment: dto.comment,
          },
        });
        await this.recomputeAggregate(tx, ReviewTargetType.PET_FRIENDLY_PLACE, placeId);
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException({ error: { code: 'ALREADY_REVIEWED', message: 'You already rated this place.' } });
      }
      throw err;
    }

    if (place.submittedById !== userId) {
      void this.notifications.notify({
        userId: place.submittedById,
        audience: NotificationAudience.CUSTOMER,
        event: 'review.created',
        title: 'Nueva reseña',
        body: `"${place.name}" recibió una nueva reseña de ${dto.rating}★.`,
        entityType: 'PetFriendlyPlace',
        entityId: placeId,
        idempotencyKey: `review-created:${userId}:PET_FRIENDLY_PLACE:${placeId}`,
      });
    }

    return this.listPublishedForPlace(placeId);
  }

  // ── Business — read + reply ─────────────────────────────────────────────

  async listForBusiness(businessId: string, query: { targetType?: ReviewTargetType; page?: number; pageSize?: number }) {
    const services = await this.prisma.service.findMany({ where: { businessId }, select: { id: true } });
    const products = await this.prisma.product.findMany({ where: { businessId }, select: { id: true } });
    const serviceIds = services.map((s) => s.id);
    const productIds = products.map((p) => p.id);

    const orClauses: Prisma.ReviewWhereInput[] = [
      { targetType: ReviewTargetType.BUSINESS, targetId: businessId },
      ...(serviceIds.length > 0 ? [{ targetType: ReviewTargetType.SERVICE, targetId: { in: serviceIds } } as Prisma.ReviewWhereInput] : []),
      ...(productIds.length > 0 ? [{ targetType: ReviewTargetType.PRODUCT, targetId: { in: productIds } } as Prisma.ReviewWhereInput] : []),
    ];

    const { skip, take, page, pageSize } = resolvePagination(query);
    const where: Prisma.ReviewWhereInput = {
      status: { not: ReviewStatus.HIDDEN },
      OR: query.targetType ? orClauses.filter((c) => c.targetType === query.targetType) : orClauses,
    };
    const [total, reviews] = await this.prisma.$transaction([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { author: { select: { firstName: true, lastName: true } } },
      }),
    ]);
    return { data: reviews, meta: { page, pageSize, total } };
  }

  async reply(businessId: string, reviewId: string, dto: BusinessReplyDto) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');
    await this.assertBusinessOwnsTarget(businessId, review.targetType, review.targetId);

    return this.prisma.review.update({
      where: { id: reviewId },
      data: { businessReply: dto.reply, businessRepliedAt: new Date() },
    });
  }

  private async assertBusinessOwnsTarget(businessId: string, targetType: ReviewTargetType, targetId: string) {
    if (targetType === ReviewTargetType.BUSINESS) {
      if (targetId !== businessId) throw new ForbiddenException('Not your review to reply to');
      return;
    }
    if (targetType === ReviewTargetType.SERVICE) {
      const service = await this.prisma.service.findUnique({ where: { id: targetId }, select: { businessId: true } });
      if (!service || service.businessId !== businessId) throw new ForbiddenException('Not your review to reply to');
      return;
    }
    if (targetType === ReviewTargetType.PRODUCT) {
      const product = await this.prisma.product.findUnique({ where: { id: targetId }, select: { businessId: true } });
      if (!product || product.businessId !== businessId) throw new ForbiddenException('Not your review to reply to');
      return;
    }
    throw new ForbiddenException('This review is not for your business');
  }

  // ── Reports (any authenticated user) ────────────────────────────────────

  async report(userId: string, reviewId: string, dto: ReportReviewDto) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');

    const [report] = await this.prisma.$transaction([
      this.prisma.reviewReport.create({
        data: { reviewId, reportedBy: userId, reason: dto.reason },
      }),
      this.prisma.review.update({ where: { id: reviewId }, data: { status: ReviewStatus.FLAGGED } }),
    ]);
    return report;
  }

  // ── Admin moderation ─────────────────────────────────────────────────────

  async listForAdmin(query: {
    status?: ReviewStatus;
    targetType?: ReviewTargetType;
    targetId?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    const { skip, take, page, pageSize } = resolvePagination(query);
    const where: Prisma.ReviewWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
      ...(query.search ? { comment: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const [total, reviews] = await this.prisma.$transaction([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { author: { select: { firstName: true, lastName: true, email: true } }, reports: true },
      }),
    ]);
    return { data: reviews, meta: { page, pageSize, total } };
  }

  async getForAdmin(reviewId: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      include: { author: { select: { firstName: true, lastName: true, email: true } }, reports: { include: { reporter: { select: { firstName: true, lastName: true } } } } },
    });
    if (!review) throw new NotFoundException('Review not found');
    return review;
  }

  async hide(reviewId: string) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.review.update({ where: { id: reviewId }, data: { status: ReviewStatus.HIDDEN } });
      await this.recomputeAggregate(tx, review.targetType, review.targetId);
    });
    return this.getForAdmin(reviewId);
  }

  async restore(reviewId: string) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.review.update({ where: { id: reviewId }, data: { status: ReviewStatus.PUBLISHED } });
      await this.recomputeAggregate(tx, review.targetType, review.targetId);
    });
    return this.getForAdmin(reviewId);
  }

  async listReports(query: { status?: ReviewReportStatus; page?: number; pageSize?: number }) {
    const { skip, take, page, pageSize } = resolvePagination(query);
    const where: Prisma.ReviewReportWhereInput = query.status ? { status: query.status } : {};
    const [total, reports] = await this.prisma.$transaction([
      this.prisma.reviewReport.count({ where }),
      this.prisma.reviewReport.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { review: true, reporter: { select: { firstName: true, lastName: true } } },
      }),
    ]);
    return { data: reports, meta: { page, pageSize, total } };
  }

  async resolveReport(adminId: string, reportId: string, action: 'RESOLVED' | 'DISMISSED', dto: ResolveReportDto) {
    const report = await this.prisma.reviewReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found');
    return this.prisma.reviewReport.update({
      where: { id: reportId },
      data: { status: action, resolution: dto.resolution, resolvedBy: adminId, resolvedAt: new Date() },
    });
  }

  // ── Shared ────────────────────────────────────────────────────────────────

  private async getOwnedOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== userId) throw new ForbiddenException('Not your order');
    return order;
  }

  private async getOwnedBooking(userId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.userId !== userId) throw new ForbiddenException('Not your booking');
    return booking;
  }

  /** Recomputed from scratch (not incremented) so two concurrent reviews for the same target —
   * even across different orders/bookings — never race each other into losing an update: both
   * transactions read committed data that includes their own just-inserted row, and whichever
   * commits last simply overwrites with a value that already accounts for both. Only PUBLISHED
   * reviews count — hiding one must be reflected in the average immediately. */
  private async recomputeAggregate(tx: Prisma.TransactionClient, targetType: ReviewTargetType, targetId: string) {
    const agg = await tx.review.aggregate({
      where: { targetType, targetId, status: ReviewStatus.PUBLISHED },
      _avg: { rating: true },
      _count: { rating: true },
    });
    const data = { ratingAvg: agg._avg.rating ?? 0, reviewCount: agg._count.rating };
    if (targetType === ReviewTargetType.BUSINESS) {
      await tx.business.update({ where: { id: targetId }, data });
    } else if (targetType === ReviewTargetType.RIDER) {
      await tx.rider.update({ where: { id: targetId }, data });
    } else if (targetType === ReviewTargetType.PRODUCT) {
      await tx.product.update({ where: { id: targetId }, data });
    } else if (targetType === ReviewTargetType.SERVICE) {
      await tx.service.update({ where: { id: targetId }, data });
    } else if (targetType === ReviewTargetType.PET_FRIENDLY_PLACE) {
      await tx.petFriendlyPlace.update({ where: { id: targetId }, data });
    }
  }
}
