import { Injectable } from '@nestjs/common';
import { BookingStatus, FulfillmentType, OrderStatus, Prisma } from '@prisma/client';
import { DateRange, resolveDateRange } from '@bingoplus/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessCapabilitiesService } from '../business-capabilities/business-capabilities.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

/**
 * FASE 8 §1.1 — every section is gated by BusinessCapabilities, never by BusinessCategory (RULE
 * 7/8): a business with SELLS_PRODUCTS=false never sees `marketplace`, one with SERVICES=false
 * and BOOKINGS=false never sees `services`, etc. Every number is a real aggregate query against
 * data that already exists — nothing here is invented to fill the dashboard (§1.4).
 */
@Injectable()
export class BusinessAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capabilities: BusinessCapabilitiesService,
  ) {}

  async getAnalytics(businessId: string, query: AnalyticsQueryDto) {
    const range = resolveDateRange(query);
    const caps = await this.capabilities.getMap(businessId);

    const [marketplace, directory, services] = await Promise.all([
      caps.SELLS_PRODUCTS ? this.getMarketplace(businessId, range) : null,
      caps.DIRECTORY_LISTING ? this.getDirectory(businessId, range, caps.COUPONS) : null,
      caps.SERVICES || caps.BOOKINGS ? this.getServices(businessId, range) : null,
    ]);

    return {
      range: { from: range.from, to: range.to, preset: range.preset },
      marketplace,
      directory,
      services,
    };
  }

  private async getMarketplace(businessId: string, range: DateRange) {
    const where: Prisma.OrderWhereInput = { businessId, createdAt: { gte: range.from, lte: range.to } };

    const [revenueAgg, completedCount, cancelledCount, byFulfillment, topProductsRaw] = await Promise.all([
      // §"business must never see service/delivery fees": Business-facing "revenue" is the
      // business's own share (subtotal − discount + tax), never Order.total — that field also
      // carries the platform's serviceFee and the rider's deliveryFee, money that never reaches
      // this business. Admin analytics (admin-analytics.service.ts) is untouched and still uses
      // the full Order.total — this fix is business-app-facing only.
      this.prisma.order.aggregate({
        where: { ...where, status: { not: OrderStatus.CANCELLED } },
        _sum: { subtotal: true, discount: true, tax: true },
        _count: { _all: true },
      }),
      this.prisma.order.count({ where: { ...where, status: OrderStatus.COMPLETED } }),
      this.prisma.order.count({ where: { ...where, status: OrderStatus.CANCELLED } }),
      this.prisma.order.groupBy({ by: ['fulfillmentType'], where: { ...where, status: { not: OrderStatus.CANCELLED } }, _count: { _all: true } }),
      this.prisma.orderItem.groupBy({
        by: ['productId'],
        where: { order: { ...where, status: { not: OrderStatus.CANCELLED } } },
        _sum: { quantity: true, subtotal: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 5,
      }),
    ]);

    const products = topProductsRaw.length
      ? await this.prisma.product.findMany({ where: { id: { in: topProductsRaw.map((p) => p.productId) } }, select: { id: true, name: true } })
      : [];
    const productNameById = new Map(products.map((p) => [p.id, p.name]));

    const ordersCount = revenueAgg._count._all;
    const revenue =
      Number(revenueAgg._sum.subtotal ?? 0) - Number(revenueAgg._sum.discount ?? 0) + Number(revenueAgg._sum.tax ?? 0);

    return {
      ordersCount,
      completedOrders: completedCount,
      cancelledOrders: cancelledCount,
      revenue,
      averageTicket: ordersCount > 0 ? Math.round((revenue / ordersCount) * 100) / 100 : 0,
      deliveryVsPickup: {
        delivery: byFulfillment.find((f) => f.fulfillmentType === FulfillmentType.DELIVERY)?._count._all ?? 0,
        pickup: byFulfillment.find((f) => f.fulfillmentType === FulfillmentType.PICKUP)?._count._all ?? 0,
      },
      topProducts: topProductsRaw.map((p) => ({
        productId: p.productId,
        name: productNameById.get(p.productId) ?? p.productId,
        quantitySold: p._sum.quantity ?? 0,
        revenue: Number(p._sum.subtotal ?? 0),
      })),
    };
  }

  private async getDirectory(businessId: string, range: DateRange, couponsEnabled: boolean) {
    const [profileViews, favorites, couponData] = await Promise.all([
      this.prisma.analyticsEvent.count({
        where: { eventName: 'BUSINESS_VIEWED', entityId: businessId, createdAt: { gte: range.from, lte: range.to } },
      }),
      this.prisma.favorite.count({ where: { targetType: 'BUSINESS', targetId: businessId } }),
      couponsEnabled ? this.getCouponAnalytics(businessId, range) : null,
    ]);

    return { profileViews, favorites, coupons: couponData };
  }

  private async getCouponAnalytics(businessId: string, range: DateRange) {
    const coupons = await this.prisma.businessCoupon.findMany({ where: { businessId }, select: { id: true } });
    const couponIds = coupons.map((c) => c.id);

    const [views, redemptions] = await Promise.all([
      couponIds.length > 0
        ? this.prisma.analyticsEvent.count({ where: { eventName: 'COUPON_VIEWED', entityId: { in: couponIds }, createdAt: { gte: range.from, lte: range.to } } })
        : 0,
      this.prisma.couponRedemption.count({ where: { businessId, redeemedAt: { gte: range.from, lte: range.to } } }),
    ]);

    return { views, redemptions };
  }

  private async getServices(businessId: string, range: DateRange) {
    const where: Prisma.BookingWhereInput = { businessId, createdAt: { gte: range.from, lte: range.to } };

    const [byStatus, revenueAgg, topServicesRaw] = await Promise.all([
      this.prisma.booking.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.booking.aggregate({ where: { ...where, status: BookingStatus.COMPLETED }, _sum: { price: true } }),
      this.prisma.booking.groupBy({ by: ['serviceId'], where, _count: { _all: true }, orderBy: { _count: { serviceId: 'desc' } }, take: 5 }),
    ]);

    const services = topServicesRaw.length
      ? await this.prisma.service.findMany({ where: { id: { in: topServicesRaw.map((s) => s.serviceId) } }, select: { id: true, name: true } })
      : [];
    const serviceNameById = new Map(services.map((s) => [s.id, s.name]));

    const countFor = (status: BookingStatus) => byStatus.find((b) => b.status === status)?._count._all ?? 0;

    return {
      bookingsCount: byStatus.reduce((sum, b) => sum + b._count._all, 0),
      confirmedBookings: countFor(BookingStatus.CONFIRMED),
      completedBookings: countFor(BookingStatus.COMPLETED),
      cancelledBookings: countFor(BookingStatus.CANCELLED),
      noShowBookings: countFor(BookingStatus.NO_SHOW),
      revenue: Number(revenueAgg._sum.price ?? 0),
      topServices: topServicesRaw.map((s) => ({ serviceId: s.serviceId, name: serviceNameById.get(s.serviceId) ?? s.serviceId, bookingsCount: s._count._all })),
    };
  }
}
