import { Injectable } from '@nestjs/common';
import {
  BusinessMembershipStatus,
  DeliveryStatus,
  FulfillmentType,
  OrderStatus,
  Prisma,
  RiderEarningType,
} from '@prisma/client';
import { DateRange, resolveDateRange } from '@bingoplus/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

/**
 * FASE 8 §1.2, reworked to focus on what actually moves BINGO+'s own revenue (Marketplace
 * commission, Directory membership, Delivery commission/tax withholding, platform coupons that
 * discount membership billing) — Services/Bookings, business-issued coupons, and businesses-by-
 * category never flowed through BINGO+'s take-rate, so they're deliberately not computed here at
 * all anymore (not just hidden on the frontend).
 */
@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAnalytics(query: AnalyticsQueryDto) {
    const range = resolveDateRange(query);
    const [marketplace, directory, delivery, platformCoupons] = await Promise.all([
      this.getMarketplace(range),
      this.getDirectory(),
      this.getDelivery(range),
      this.getPlatformCoupons(),
    ]);

    return { range: { from: range.from, to: range.to, preset: range.preset }, marketplace, directory, delivery, platformCoupons };
  }

  private async getMarketplace(range: DateRange) {
    const where: Prisma.OrderWhereInput = { createdAt: { gte: range.from, lte: range.to } };

    const [revenueAgg, byStatus, byFulfillment, discountAgg, byBusiness] = await Promise.all([
      // GMV is the sale itself — never tax/service-fee/delivery-fee stacked on top (same rule as
      // BusinessesService.countSalesByBusiness). Cancelled orders never generated real revenue.
      this.prisma.order.aggregate({ where: { ...where, status: { not: OrderStatus.CANCELLED } }, _sum: { subtotal: true }, _count: { _all: true } }),
      this.prisma.order.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.order.groupBy({ by: ['fulfillmentType'], where: { ...where, status: { not: OrderStatus.CANCELLED } }, _count: { _all: true } }),
      this.prisma.order.aggregate({ where: { ...where, status: { not: OrderStatus.CANCELLED } }, _sum: { discount: true } }),
      this.prisma.order.groupBy({ by: ['businessId'], where: { ...where, status: { not: OrderStatus.CANCELLED } }, _sum: { subtotal: true } }),
    ]);

    // Real commission estimate: each business's real in-range GMV (sale only) × its
    // currently-effective rate — same math as BusinessesService.listCommissionsForAdmin, scoped
    // to this date range.
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
      return rate ? sum + Number(b._sum.subtotal ?? 0) * rate : sum;
    }, 0);

    const ordersCount = revenueAgg._count._all;
    const gmv = Number(revenueAgg._sum.subtotal ?? 0);

    return {
      gmv,
      ordersCount,
      averageTicket: ordersCount > 0 ? Math.round((gmv / ordersCount) * 100) / 100 : 0,
      estimatedCommissionRevenue: Math.round(estimatedCommissionRevenue * 100) / 100,
      discountsGranted: Number(discountAgg._sum.discount ?? 0),
      // Every status with at least one order in range — the donut chart on the frontend renders
      // exactly this, it never fabricates a status Prisma didn't actually group.
      ordersByStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
      deliveryVsPickup: {
        delivery: byFulfillment.find((f) => f.fulfillmentType === FulfillmentType.DELIVERY)?._count._all ?? 0,
        pickup: byFulfillment.find((f) => f.fulfillmentType === FulfillmentType.PICKUP)?._count._all ?? 0,
      },
    };
  }

  private async getDirectory() {
    const [businessesByStatusRaw, activeMembershipsWithPlan, trialMembershipsWithPlan, cancelledMembershipsTotal] =
      await Promise.all([
        this.prisma.business.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { _all: true } }),
        // Only ACTIVE memberships are actually being billed — TRIAL ones haven't paid a cent yet
        // and may never convert, so their plan price is never counted as real revenue.
        this.prisma.businessMembership.findMany({
          where: { status: BusinessMembershipStatus.ACTIVE },
          select: { plan: { select: { price: true } } },
        }),
        this.prisma.businessMembership.findMany({
          where: { status: BusinessMembershipStatus.TRIAL },
          select: { plan: { select: { price: true } } },
        }),
        this.prisma.businessMembership.count({ where: { status: BusinessMembershipStatus.CANCELLED } }),
      ]);

    const activeMembershipValue = activeMembershipsWithPlan.reduce((sum, m) => sum + Number(m.plan.price), 0);
    const trialMembershipValue = trialMembershipsWithPlan.reduce((sum, m) => sum + Number(m.plan.price), 0);

    return {
      businessesByStatus: businessesByStatusRaw.map((b) => ({ status: b.status, count: b._count._all })),
      activeMemberships: activeMembershipsWithPlan.length,
      trialMemberships: trialMembershipsWithPlan.length,
      cancelledMembershipsTotal,
      activeMembershipValue,
      trialMembershipValue,
    };
  }

  /** Platform (Admin) coupons discount membership billing — a Directory-revenue lever, unlike
   * business-issued coupons (which discount a business's own product prices and never touch
   * BINGO+'s own take), so only these are still computed at all. Capacity/redeemed are scoped to
   * currently-ACTIVE coupons and counted all-time — a redemption cap isn't a date-range concept. */
  private async getPlatformCoupons() {
    const activeCoupons = await this.prisma.adminCoupon.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, usageLimit: true },
    });
    const activeCouponIds = activeCoupons.map((c) => c.id);
    const totalCapacity = activeCoupons.reduce((sum, c) => sum + (c.usageLimit ?? 0), 0);
    const totalRedeemed =
      activeCouponIds.length > 0
        ? await this.prisma.adminCouponRedemption.count({ where: { couponId: { in: activeCouponIds } } })
        : 0;

    return { active: activeCoupons.length, totalCapacity, totalRedeemed };
  }

  private async getDelivery(range: DateRange) {
    const where: Prisma.DeliveryWhereInput = { createdAt: { gte: range.from, lte: range.to } };
    const [completedCount, cancelledCount, failedCount, totalCount, durationAgg, distanceAgg, revenueAgg] = await Promise.all([
      this.prisma.delivery.count({ where: { ...where, status: DeliveryStatus.DELIVERED } }),
      this.prisma.delivery.count({ where: { ...where, status: DeliveryStatus.CANCELLED } }),
      this.prisma.delivery.count({ where: { ...where, status: DeliveryStatus.FAILED } }),
      this.prisma.delivery.count({ where }),
      this.prisma.delivery.aggregate({ where: { ...where, status: DeliveryStatus.DELIVERED }, _avg: { actualDurationMinutes: true } }),
      this.prisma.delivery.aggregate({ where: { ...where, status: DeliveryStatus.DELIVERED }, _avg: { actualDistanceKm: true } }),
      // BINGO+'s actual take from delivery is RiderEarning.commissionAmount (net fare × the
      // configured commission rate), never Delivery.deliveryFee (which is mostly the rider's own
      // pay) — same "commission, not gross" rule as Marketplace GMV. Already the $ result of
      // applying the rate, so there's no separate %-rate figure to show alongside it.
      this.prisma.riderEarning.aggregate({
        where: { type: RiderEarningType.DELIVERY_FEE, createdAt: { gte: range.from, lte: range.to } },
        _sum: { commissionAmount: true },
      }),
    ]);

    const inProgressCount = Math.max(totalCount - completedCount - cancelledCount - failedCount, 0);

    return {
      deliveriesCount: totalCount,
      completedDeliveries: completedCount,
      cancelledDeliveries: cancelledCount,
      failedDeliveries: failedCount,
      inProgressDeliveries: inProgressCount,
      averageDurationMinutes: durationAgg._avg.actualDurationMinutes != null ? Math.round(durationAgg._avg.actualDurationMinutes) : null,
      averageDistanceKm: distanceAgg._avg.actualDistanceKm != null ? Math.round(distanceAgg._avg.actualDistanceKm * 10) / 10 : null,
      revenue: Number(revenueAgg._sum.commissionAmount ?? 0),
    };
  }
}
