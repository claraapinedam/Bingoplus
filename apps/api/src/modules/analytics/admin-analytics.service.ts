import { Injectable } from '@nestjs/common';
import {
  BookingStatus,
  BusinessCapabilityType,
  BusinessMembershipStatus,
  BusinessStatus,
  DeliveryStatus,
  FulfillmentType,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { DateRange, resolveDateRange } from '@bingoplus/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

/**
 * FASE 8 §1.2 — global, platform-wide analytics. Business Coupons and Admin Coupons are kept in
 * two entirely separate blocks (RULE 3/4) — never summed into one "coupons" figure, since they're
 * different financial domains (Directory redemption vs Membership billing discount).
 */
@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAnalytics(query: AnalyticsQueryDto) {
    const range = resolveDateRange(query);
    const [marketplace, directory, services, delivery, coupons] = await Promise.all([
      this.getMarketplace(range),
      this.getDirectory(range),
      this.getServices(range),
      this.getDelivery(range),
      this.getCoupons(range),
    ]);

    return { range: { from: range.from, to: range.to, preset: range.preset }, marketplace, directory, services, delivery, coupons };
  }

  private async getMarketplace(range: DateRange) {
    const where: Prisma.OrderWhereInput = { createdAt: { gte: range.from, lte: range.to } };

    const [revenueAgg, completedCount, cancelledCount, byFulfillment, discountAgg, byBusiness] = await Promise.all([
      this.prisma.order.aggregate({ where: { ...where, status: { not: OrderStatus.CANCELLED } }, _sum: { total: true }, _count: { _all: true } }),
      this.prisma.order.count({ where: { ...where, status: OrderStatus.COMPLETED } }),
      this.prisma.order.count({ where: { ...where, status: OrderStatus.CANCELLED } }),
      this.prisma.order.groupBy({ by: ['fulfillmentType'], where: { ...where, status: { not: OrderStatus.CANCELLED } }, _count: { _all: true } }),
      this.prisma.order.aggregate({ where: { ...where, status: { not: OrderStatus.CANCELLED } }, _sum: { discount: true } }),
      this.prisma.order.groupBy({ by: ['businessId'], where: { ...where, status: { not: OrderStatus.CANCELLED } }, _sum: { total: true } }),
    ]);

    // Real commission estimate: each business's real in-range GMV × its currently-effective rate
    // — same math as BusinessesService.listCommissionsForAdmin, scoped to this date range.
    const businessIds = byBusiness.map((b) => b.businessId);
    const commissions =
      businessIds.length > 0
        ? await this.prisma.commission.findMany({ where: { businessId: { in: businessIds } }, orderBy: { effectiveFrom: 'desc' } })
        : [];
    const rateByBusiness = new Map<string, number>();
    for (const c of commissions) {
      if (!rateByBusiness.has(c.businessId)) rateByBusiness.set(c.businessId, Number(c.rate));
    }
    const estimatedCommissionRevenue = byBusiness.reduce((sum, b) => {
      const rate = rateByBusiness.get(b.businessId);
      return rate ? sum + Number(b._sum.total ?? 0) * rate : sum;
    }, 0);

    const ordersCount = revenueAgg._count._all;
    const gmv = Number(revenueAgg._sum.total ?? 0);

    return {
      gmv,
      ordersCount,
      completedOrders: completedCount,
      cancelledOrders: cancelledCount,
      averageTicket: ordersCount > 0 ? Math.round((gmv / ordersCount) * 100) / 100 : 0,
      deliveryVsPickup: {
        delivery: byFulfillment.find((f) => f.fulfillmentType === FulfillmentType.DELIVERY)?._count._all ?? 0,
        pickup: byFulfillment.find((f) => f.fulfillmentType === FulfillmentType.PICKUP)?._count._all ?? 0,
      },
      estimatedCommissionRevenue: Math.round(estimatedCommissionRevenue * 100) / 100,
      discountsGranted: Number(discountAgg._sum.discount ?? 0),
    };
  }

  private async getDirectory(range: DateRange) {
    const [activeBusinesses, byCategory, capabilityCounts, activeMemberships, newBusinesses, cancelledMemberships] = await Promise.all([
      this.prisma.business.count({ where: { status: BusinessStatus.ACTIVE, deletedAt: null } }),
      this.prisma.business.groupBy({ by: ['categoryId'], where: { status: BusinessStatus.ACTIVE, deletedAt: null }, _count: { _all: true } }),
      Promise.all(
        Object.values(BusinessCapabilityType).map(async (capability) => ({
          capability,
          count: await this.prisma.businessCapability.count({ where: { capability, enabled: true } }),
        })),
      ),
      this.prisma.businessMembership.count({ where: { status: { in: [BusinessMembershipStatus.TRIAL, BusinessMembershipStatus.ACTIVE] } } }),
      this.prisma.business.count({ where: { createdAt: { gte: range.from, lte: range.to } } }),
      this.prisma.businessMembership.count({ where: { cancelledAt: { gte: range.from, lte: range.to } } }),
    ]);

    const categories = byCategory.length
      ? await this.prisma.businessCategory.findMany({ where: { id: { in: byCategory.map((c) => c.categoryId) } }, select: { id: true, name: true } })
      : [];
    const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

    return {
      activeBusinesses,
      newBusinesses,
      activeMemberships,
      cancelledMemberships,
      businessesByCategory: byCategory.map((c) => ({ categoryId: c.categoryId, name: categoryNameById.get(c.categoryId) ?? c.categoryId, count: c._count._all })),
      businessesByCapability: Object.fromEntries(capabilityCounts.map((c) => [c.capability, c.count])),
    };
  }

  private async getServices(range: DateRange) {
    const where: Prisma.BookingWhereInput = { createdAt: { gte: range.from, lte: range.to } };
    const [byStatus, topServicesRaw] = await Promise.all([
      this.prisma.booking.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.booking.groupBy({ by: ['serviceId'], where, _count: { _all: true }, orderBy: { _count: { serviceId: 'desc' } }, take: 5 }),
    ]);
    const services = topServicesRaw.length
      ? await this.prisma.service.findMany({ where: { id: { in: topServicesRaw.map((s) => s.serviceId) } }, select: { id: true, name: true, business: { select: { tradeName: true } } } })
      : [];
    const serviceById = new Map(services.map((s) => [s.id, s]));
    const countFor = (status: BookingStatus) => byStatus.find((b) => b.status === status)?._count._all ?? 0;

    return {
      bookingsCount: byStatus.reduce((sum, b) => sum + b._count._all, 0),
      completedBookings: countFor(BookingStatus.COMPLETED),
      cancelledBookings: countFor(BookingStatus.CANCELLED),
      noShowBookings: countFor(BookingStatus.NO_SHOW),
      topServices: topServicesRaw.map((s) => {
        const svc = serviceById.get(s.serviceId);
        return { serviceId: s.serviceId, name: svc?.name ?? s.serviceId, business: svc?.business.tradeName ?? '', bookingsCount: s._count._all };
      }),
    };
  }

  private async getDelivery(range: DateRange) {
    const where: Prisma.DeliveryWhereInput = { createdAt: { gte: range.from, lte: range.to } };
    const [completedCount, cancelledCount, failedCount, durationAgg, distanceAgg, activeRiders, incidents] = await Promise.all([
      this.prisma.delivery.count({ where: { ...where, status: DeliveryStatus.DELIVERED } }),
      this.prisma.delivery.count({ where: { ...where, status: DeliveryStatus.CANCELLED } }),
      this.prisma.delivery.count({ where: { ...where, status: DeliveryStatus.FAILED } }),
      this.prisma.delivery.aggregate({ where: { ...where, status: DeliveryStatus.DELIVERED }, _avg: { actualDurationMinutes: true } }),
      this.prisma.delivery.aggregate({ where: { ...where, status: DeliveryStatus.DELIVERED }, _avg: { actualDistanceKm: true } }),
      this.prisma.rider.count({ where: { accountStatus: 'ACTIVE' } }),
      this.prisma.deliveryIncident.count({ where: { createdAt: { gte: range.from, lte: range.to } } }),
    ]);
    const totalCount = await this.prisma.delivery.count({ where });

    return {
      deliveriesCount: totalCount,
      completedDeliveries: completedCount,
      cancelledDeliveries: cancelledCount,
      failedDeliveries: failedCount,
      averageDurationMinutes: durationAgg._avg.actualDurationMinutes != null ? Math.round(durationAgg._avg.actualDurationMinutes) : null,
      averageDistanceKm: distanceAgg._avg.actualDistanceKm != null ? Math.round(distanceAgg._avg.actualDistanceKm * 10) / 10 : null,
      activeRiders,
      incidents,
    };
  }

  private async getCoupons(range: DateRange) {
    const [businessCouponsActive, businessRedemptions, businessDiscountAgg, adminCouponsActive, adminRedemptions] = await Promise.all([
      this.prisma.businessCoupon.count({ where: { status: 'ACTIVE' } }),
      this.prisma.couponRedemption.count({ where: { redeemedAt: { gte: range.from, lte: range.to } } }),
      this.prisma.couponRedemption.aggregate({ where: { redeemedAt: { gte: range.from, lte: range.to } }, _sum: { discountAmount: true } }),
      this.prisma.adminCoupon.count({ where: { status: 'ACTIVE' } }),
      this.prisma.adminCouponRedemption.count({ where: { redeemedAt: { gte: range.from, lte: range.to } } }),
    ]);

    return {
      businessCoupons: { active: businessCouponsActive, redemptions: businessRedemptions, discountGranted: Number(businessDiscountAgg._sum.discountAmount ?? 0) },
      adminCoupons: { active: adminCouponsActive, redemptions: adminRedemptions },
    };
  }
}
