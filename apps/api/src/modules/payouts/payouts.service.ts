import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, PayeeType, Prisma, PayoutStatus, RiderEarningStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Admin "Pagos" module (Businesses & Riders) — accumulates what BINGO+ owes each payee, already
 * net of commission/tax, and lets admin flip selected payees from pending to paid.
 *
 * Design (see the Payout model's schema comment for the full rationale): the "pending" list below
 * is always computed live from the real ledgers — RiderEarning for riders (the same table
 * DeliveryService.complete() writes and the rider's own Ganancias screen reads), and Order GMV ×
 * the business's current Commission rate for businesses (the same "real GMV × current rate, never
 * a fabricated figure" pattern BusinessesService.listCommissionsForAdmin/getCommissionSummary
 * already use) — never a second, drifting copy of that math. A `Payout` row is only ever created
 * already PAID, at the exact moment admin marks a payee's balance as paid, and that same write
 * stamps `payoutId` on every RiderEarning/Order row it covers. Because the pending query always
 * filters `payoutId: null`, a row can be swept into a Payout exactly once — there's no
 * intermediate "PENDING Payout" state that could be generated twice or paid twice.
 */
@Injectable()
export class PayoutsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Orders whose customer payment has actually gone through — the same set of statuses
   * CheckoutService transitions an Order into once Payment.status becomes PAID (never CREATED/
   * PAYMENT_PENDING, which is money BINGO+ hasn't actually received yet, and never CANCELLED). */
  private static readonly PAID_ORDER_STATUSES: OrderStatus[] = [
    OrderStatus.PAID,
    OrderStatus.CONFIRMED,
    OrderStatus.PREPARING,
    OrderStatus.READY_FOR_PICKUP,
    OrderStatus.COMPLETED,
  ];

  // ───────────────────────────── Riders ─────────────────────────────

  /** One line item per rider that has *ever* had earnings — not just those currently owed. A rider
   * whose whole balance just got marked paid still needs a row here (with amount 0) so admin can
   * click through to their Pagado history; only showing payees with an outstanding balance made
   * them vanish from this list the moment they were fully paid, with no way back to their
   * history. The accumulated total at the top still only sums what's actually pending. */
  async listPendingRiders() {
    const allGrouped = await this.prisma.riderEarning.groupBy({ by: ['riderId'], _count: { _all: true } });
    if (allGrouped.length === 0) return { total: 0, items: [] };

    const pendingGrouped = await this.prisma.riderEarning.groupBy({
      by: ['riderId'],
      where: { status: RiderEarningStatus.PENDING, payoutId: null },
      _sum: { netAmount: true },
      _count: { _all: true },
    });
    const pendingByRider = new Map(
      pendingGrouped.map((g) => [g.riderId, { amount: Number(g._sum.netAmount ?? 0), count: g._count._all }]),
    );

    const riderIds = allGrouped.map((g) => g.riderId);
    const riders = await this.prisma.rider.findMany({
      where: { id: { in: riderIds } },
      select: { id: true, user: { select: { firstName: true, lastName: true, email: true } } },
    });
    const riderById = new Map(riders.map((r) => [r.id, r]));

    const items = riderIds
      .map((riderId) => {
        const rider = riderById.get(riderId);
        const pending = pendingByRider.get(riderId);
        return {
          riderId,
          riderName: rider ? `${rider.user.firstName} ${rider.user.lastName}`.trim() : 'Rider',
          riderEmail: rider?.user.email ?? null,
          earningsCount: pending?.count ?? 0,
          amount: pending?.amount ?? 0,
        };
      })
      .sort((a, b) => b.amount - a.amount);

    const total = Math.round(items.reduce((sum, i) => sum + i.amount, 0) * 100) / 100;
    return { total, items };
  }

  /** Marks each selected rider's *entire current* outstanding balance as paid in one shot — not a
   * partial amount, mirroring how the request was phrased ("pasar de pendiente a pagado", not
   * "pagar parcialmente"). Idempotent per rider: a rider with nothing outstanding (already paid,
   * or raced by a concurrent request) is silently skipped rather than erroring the whole batch. */
  async markRidersPaid(riderIds: string[], adminId?: string) {
    const paid: { riderId: string; amount: number; payoutId: string }[] = [];
    for (const riderId of riderIds) {
      const result = await this.prisma.$transaction(async (tx) => {
        const earnings = await tx.riderEarning.findMany({
          where: { riderId, status: RiderEarningStatus.PENDING, payoutId: null },
          select: { id: true, netAmount: true, createdAt: true },
        });
        if (earnings.length === 0) return null;

        const amount = earnings.reduce((sum, e) => sum.plus(e.netAmount), new Prisma.Decimal(0));
        const periodStart = earnings.reduce((min, e) => (e.createdAt < min ? e.createdAt : min), earnings[0].createdAt);
        const payout = await tx.payout.create({
          data: {
            payeeType: PayeeType.RIDER,
            riderId,
            amount,
            status: PayoutStatus.PAID,
            paidAt: new Date(),
            periodStart,
            periodEnd: new Date(),
          },
        });

        // Guarded by payoutId: null again here (not just in the SELECT above) so a concurrent
        // mark-paid call for the same rider can't double-sweep the same earning into two Payouts —
        // whichever transaction's updateMany actually matches a row wins.
        const { count } = await tx.riderEarning.updateMany({
          where: { id: { in: earnings.map((e) => e.id) }, payoutId: null },
          data: { payoutId: payout.id, status: RiderEarningStatus.PAID },
        });
        if (count !== earnings.length) {
          throw new BadRequestException('Otro proceso ya estaba pagando a este rider. Intenta de nuevo.');
        }
        return { riderId, amount: Number(amount), payoutId: payout.id };
      });
      if (result) paid.push(result);
    }

    return {
      paidCount: paid.length,
      totalPaid: Math.round(paid.reduce((sum, p) => sum + p.amount, 0) * 100) / 100,
      payouts: paid,
    };
  }

  /** Per-rider drilldown (Pagos a riders → click a rider) — the individual PENDING earnings behind
   * that rider's summary row, so admin can select a subset rather than only ever paying the whole
   * balance at once. */
  async getRiderPending(riderId: string) {
    const earnings = await this.prisma.riderEarning.findMany({
      where: { riderId, status: RiderEarningStatus.PENDING, payoutId: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, deliveryId: true, grossAmount: true, commissionAmount: true, taxWithheldAmount: true, netAmount: true, createdAt: true },
    });
    const items = earnings.map((e) => ({
      id: e.id,
      deliveryId: e.deliveryId,
      grossAmount: Number(e.grossAmount),
      commissionAmount: Number(e.commissionAmount),
      taxWithheldAmount: Number(e.taxWithheldAmount),
      netAmount: Number(e.netAmount),
      createdAt: e.createdAt,
    }));
    const total = Math.round(items.reduce((sum, i) => sum + i.netAmount, 0) * 100) / 100;
    return { total, items };
  }

  /** Same drilldown, paid side — every Payout already issued to this rider, newest first. */
  async getRiderPaidHistory(riderId: string) {
    const payouts = await this.prisma.payout.findMany({
      where: { payeeType: PayeeType.RIDER, riderId, status: PayoutStatus.PAID },
      orderBy: { paidAt: 'desc' },
      include: { _count: { select: { riderEarnings: true } } },
    });
    return payouts.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      paidAt: p.paidAt,
      referenceNumber: p.referenceNumber,
      earningsCount: p._count.riderEarnings,
    }));
  }

  /** Pays exactly the selected earnings for one rider — unlike markRidersPaid (whole balance, many
   * riders at once), this is the item-level action inside a single rider's Pendiente tab. */
  async markRiderEarningsPaid(riderId: string, earningIds: string[], referenceNumber?: string) {
    return this.prisma.$transaction(async (tx) => {
      const earnings = await tx.riderEarning.findMany({
        where: { id: { in: earningIds }, riderId, status: RiderEarningStatus.PENDING, payoutId: null },
        select: { id: true, netAmount: true, createdAt: true },
      });
      if (earnings.length === 0) {
        throw new BadRequestException('Los pagos seleccionados ya no están pendientes.');
      }

      const amount = earnings.reduce((sum, e) => sum.plus(e.netAmount), new Prisma.Decimal(0));
      const periodStart = earnings.reduce((min, e) => (e.createdAt < min ? e.createdAt : min), earnings[0].createdAt);
      const payout = await tx.payout.create({
        data: {
          payeeType: PayeeType.RIDER,
          riderId,
          amount,
          status: PayoutStatus.PAID,
          paidAt: new Date(),
          periodStart,
          periodEnd: new Date(),
          referenceNumber: referenceNumber || null,
        },
      });

      const { count } = await tx.riderEarning.updateMany({
        where: { id: { in: earnings.map((e) => e.id) }, payoutId: null },
        data: { payoutId: payout.id, status: RiderEarningStatus.PAID },
      });
      if (count !== earnings.length) {
        throw new BadRequestException('Otro proceso ya estaba pagando alguno de estos pagos. Intenta de nuevo.');
      }
      return { payoutId: payout.id, amount: Number(amount), earningsCount: earnings.length };
    });
  }

  // ───────────────────────────── Businesses ─────────────────────────────

  /** One line item per business that has *ever* had a paid/completed order — not just those
   * currently owed. A business whose whole balance just got marked paid still needs a row here
   * (with amount 0) so admin can click through to their Pagado history; only showing payees with
   * an outstanding balance made them vanish from this list the moment they were fully paid, with
   * no way back to their history. The accumulated total at the top still only sums what's
   * actually pending.
   *
   * The "never guess a rate" rule (skip a business with no live Commission row, same rule
   * listCommissionsForAdmin follows for its `estimatedRevenue`) only actually matters while that
   * business has a nonzero pending amount to compute — a fully-paid business with no *current*
   * rate still needs to be visible for its history, just with commissionRate shown as 0.
   *
   * Membership fees (MembershipPlan/BusinessMembership/Subscription/Invoice) are deliberately NOT
   * netted out of this figure — the schema itself documents Membership billing as "a financial
   * domain separate from Marketplace orders" (see the comment above BillingFrequency), collected
   * via its own Invoice, never against a business's order payout. Folding it in here would make
   * this owed-amount silently diverge from GMV × rate the moment a business's plan price changed,
   * for no product requirement asked for. */
  async listPendingBusinesses() {
    const allGrouped = await this.prisma.order.groupBy({
      by: ['businessId'],
      where: { status: { in: PayoutsService.PAID_ORDER_STATUSES } },
    });
    if (allGrouped.length === 0) return { total: 0, items: [] };

    const pendingGrouped = await this.prisma.order.groupBy({
      by: ['businessId'],
      where: { status: { in: PayoutsService.PAID_ORDER_STATUSES }, payoutId: null },
      _sum: { subtotal: true },
      _count: { _all: true },
    });
    const pendingByBusiness = new Map(
      pendingGrouped.map((g) => [g.businessId, { gmv: Number(g._sum.subtotal ?? 0), count: g._count._all }]),
    );

    const businessIds = allGrouped.map((g) => g.businessId);
    const [businesses, commissions] = await Promise.all([
      this.prisma.business.findMany({ where: { id: { in: businessIds } }, select: { id: true, tradeName: true } }),
      this.prisma.commission.findMany({
        where: { businessId: { in: businessIds }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        orderBy: { effectiveFrom: 'desc' },
      }),
    ]);
    const businessById = new Map(businesses.map((b) => [b.id, b]));
    const rateByBusiness = new Map<string, number>();
    for (const c of commissions) {
      if (!rateByBusiness.has(c.businessId)) rateByBusiness.set(c.businessId, Number(c.rate));
    }

    const items = businessIds
      .filter((businessId) => {
        const pending = pendingByBusiness.get(businessId);
        if (!pending || pending.gmv === 0) return true; // nothing to guess — safe to show at $0
        return rateByBusiness.has(businessId); // has a real pending amount — still refuse to guess a rate
      })
      .map((businessId) => {
        const business = businessById.get(businessId);
        const pending = pendingByBusiness.get(businessId);
        const gmv = pending?.gmv ?? 0;
        const rate = rateByBusiness.get(businessId) ?? 0;
        return {
          businessId,
          tradeName: business?.tradeName ?? 'Negocio',
          ordersCount: pending?.count ?? 0,
          gmv,
          commissionRate: rate,
          amount: Math.round(gmv * (1 - rate) * 100) / 100,
        };
      })
      .sort((a, b) => b.amount - a.amount);

    const total = Math.round(items.reduce((sum, i) => sum + i.amount, 0) * 100) / 100;
    return { total, items };
  }

  /** Per-business drilldown (Pagos a negocios → click a negocio) — the individual paid/completed
   * orders behind that business's summary row, one row per order with its own GMV/commission/monto
   * a pagar, so admin can select a subset rather than only ever paying the whole balance at once. */
  async getBusinessPending(businessId: string) {
    const commission = await this.prisma.commission.findFirst({
      where: { businessId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      orderBy: { effectiveFrom: 'desc' },
    });
    const rate = commission ? Number(commission.rate) : null;

    const orders = await this.prisma.order.findMany({
      where: { businessId, status: { in: PayoutsService.PAID_ORDER_STATUSES }, payoutId: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, orderNumber: true, subtotal: true, status: true, createdAt: true },
    });
    const items = orders.map((o) => {
      const gmv = Number(o.subtotal);
      const commissionAmount = rate == null ? 0 : Math.round(gmv * rate * 100) / 100;
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        gmv,
        commissionRate: rate,
        commissionAmount,
        amount: Math.round((gmv - commissionAmount) * 100) / 100,
        status: o.status,
        createdAt: o.createdAt,
      };
    });
    const total = Math.round(items.reduce((sum, i) => sum + i.amount, 0) * 100) / 100;
    return { total, hasCommissionRate: rate != null, items };
  }

  /** Same drilldown, paid side — every Payout already issued to this business, newest first. */
  async getBusinessPaidHistory(businessId: string) {
    const payouts = await this.prisma.payout.findMany({
      where: { payeeType: PayeeType.BUSINESS, businessId, status: PayoutStatus.PAID },
      orderBy: { paidAt: 'desc' },
      include: { _count: { select: { orders: true } } },
    });
    return payouts.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      paidAt: p.paidAt,
      referenceNumber: p.referenceNumber,
      ordersCount: p._count.orders,
    }));
  }

  /** Pays exactly the selected orders for one business — the item-level action inside a single
   * business's Pendiente tab (see markRiderEarningsPaid for the rider-side equivalent). */
  async markBusinessOrdersPaid(businessId: string, orderIds: string[], referenceNumber?: string) {
    return this.prisma.$transaction(async (tx) => {
      const commission = await tx.commission.findFirst({
        where: { businessId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        orderBy: { effectiveFrom: 'desc' },
      });
      if (!commission) {
        throw new BadRequestException('Este negocio no tiene una tasa de comisión vigente configurada.');
      }

      const orders = await tx.order.findMany({
        where: { id: { in: orderIds }, businessId, status: { in: PayoutsService.PAID_ORDER_STATUSES }, payoutId: null },
        select: { id: true, subtotal: true, createdAt: true },
      });
      if (orders.length === 0) {
        throw new BadRequestException('Los pedidos seleccionados ya no están pendientes.');
      }

      const rate = new Prisma.Decimal(commission.rate);
      const gmv = orders.reduce((sum, o) => sum.plus(o.subtotal), new Prisma.Decimal(0));
      const amount = gmv.mul(new Prisma.Decimal(1).minus(rate));
      const periodStart = orders.reduce((min, o) => (o.createdAt < min ? o.createdAt : min), orders[0].createdAt);
      const payout = await tx.payout.create({
        data: {
          payeeType: PayeeType.BUSINESS,
          businessId,
          amount,
          status: PayoutStatus.PAID,
          paidAt: new Date(),
          periodStart,
          periodEnd: new Date(),
          referenceNumber: referenceNumber || null,
        },
      });

      const { count } = await tx.order.updateMany({
        where: { id: { in: orders.map((o) => o.id) }, payoutId: null },
        data: { payoutId: payout.id },
      });
      if (count !== orders.length) {
        throw new BadRequestException('Otro proceso ya estaba pagando alguno de estos pedidos. Intenta de nuevo.');
      }
      return { payoutId: payout.id, amount: Number(amount), ordersCount: orders.length };
    });
  }

  /** Shared by both payee types — the reference number is entered from the Historial tab, often
   * after the fact (the transfer may still be in flight when "Marcar como pagado" was clicked). */
  async updatePayoutReference(payoutId: string, referenceNumber: string) {
    const payout = await this.prisma.payout.findUnique({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException('Pago no encontrado.');
    return this.prisma.payout.update({ where: { id: payoutId }, data: { referenceNumber } });
  }

  /** Same "entire current outstanding balance, idempotent per payee" shape as markRidersPaid. */
  async markBusinessesPaid(businessIds: string[], adminId?: string) {
    const paid: { businessId: string; amount: number; payoutId: string }[] = [];
    for (const businessId of businessIds) {
      const result = await this.prisma.$transaction(async (tx) => {
        const orders = await tx.order.findMany({
          where: { businessId, status: { in: PayoutsService.PAID_ORDER_STATUSES }, payoutId: null },
          select: { id: true, subtotal: true, createdAt: true },
        });
        if (orders.length === 0) return null;

        const commission = await tx.commission.findFirst({
          where: { businessId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          orderBy: { effectiveFrom: 'desc' },
        });
        if (!commission) {
          // No live commission rate to apply — refuse rather than guessing one (same rule as the
          // read side). Skipped, not thrown, so one misconfigured business doesn't block the rest
          // of a bulk selection.
          return null;
        }

        const gmv = orders.reduce((sum, o) => sum.plus(o.subtotal), new Prisma.Decimal(0));
        const rate = new Prisma.Decimal(commission.rate);
        const amount = gmv.mul(new Prisma.Decimal(1).minus(rate));
        const periodStart = orders.reduce((min, o) => (o.createdAt < min ? o.createdAt : min), orders[0].createdAt);
        const payout = await tx.payout.create({
          data: {
            payeeType: PayeeType.BUSINESS,
            businessId,
            amount,
            status: PayoutStatus.PAID,
            paidAt: new Date(),
            periodStart,
            periodEnd: new Date(),
          },
        });

        const { count } = await tx.order.updateMany({
          where: { id: { in: orders.map((o) => o.id) }, payoutId: null },
          data: { payoutId: payout.id },
        });
        if (count !== orders.length) {
          throw new BadRequestException('Otro proceso ya estaba pagando a este negocio. Intenta de nuevo.');
        }
        return { businessId, amount: Number(amount), payoutId: payout.id };
      });
      if (result) paid.push(result);
    }

    return {
      paidCount: paid.length,
      totalPaid: Math.round(paid.reduce((sum, p) => sum + p.amount, 0) * 100) / 100,
      payouts: paid,
    };
  }
}
