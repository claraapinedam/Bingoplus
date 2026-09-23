import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FulfillmentType, NotificationAudience, OrderStatus } from '@prisma/client';
import { resolveDateRange, resolvePagination } from '@bingoplus/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { OrderStateMachine } from './order-state-machine';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';

const ORDER_STATUS_NOTIFICATIONS: Partial<Record<OrderStatus, { event: string; title: string; body: string }>> = {
  [OrderStatus.CONFIRMED]: { event: 'order.confirmed', title: 'Pedido confirmado', body: 'El negocio confirmó tu pedido.' },
  [OrderStatus.PREPARING]: { event: 'order.preparing', title: 'Preparando tu pedido', body: 'El negocio está preparando tu pedido.' },
  [OrderStatus.READY_FOR_PICKUP]: { event: 'order.ready', title: 'Pedido listo', body: 'Tu pedido está listo para retirar.' },
  [OrderStatus.COMPLETED]: { event: 'order.completed', title: 'Pedido completado', body: 'Tu pedido fue completado. ¡Gracias por tu compra!' },
};

const ORDER_INCLUDE = {
  items: true,
  business: { select: { id: true, tradeName: true, logoUrl: true, addressLine: true, city: true, latitude: true, longitude: true, openingHours: true } },
  // FASE 4C gap fix: the business-facing Pedidos screens need to identify who placed the order —
  // this include was Customer-only before and never carried that. First/last name only, same
  // "minimum necessary" rule already applied to Rider info shown to Customers — no email/phone.
  user: { select: { firstName: true, lastName: true } },
  payment: true,
  address: true,
  // Order.status structurally can't reflect a cancelled Delivery's refund (no transition out of
  // READY_FOR_PICKUP but COMPLETED — see OrderStateMachine) — the latest Refund row is the real
  // signal every order-detail screen (Customer/Business/Admin) now shows instead of a stale
  // "Listo para retirar" once a refund is owed or already handled.
  refunds: { orderBy: { createdAt: 'desc' }, select: { id: true, status: true, amount: true, createdAt: true } },
} as const;

/** Statuses a business may set directly via PATCH — payment-driven and terminal states are excluded (§32). */
const BUSINESS_SETTABLE_STATUSES: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.READY_FOR_PICKUP,
  OrderStatus.COMPLETED,
];

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: OrderStateMachine,
    private readonly notifications: NotificationService,
  ) {}

  // ── Customer-facing (§33/34) ────────────────────────────────────────────

  async listForCustomer(userId: string, query: ListOrdersQueryDto) {
    const { skip, take, page, pageSize } = resolvePagination(query);
    const where = {
      userId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.businessId ? { businessId: query.businessId } : {}),
    };
    const [total, orders] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: ORDER_INCLUDE,
      }),
    ]);
    return { data: orders, meta: { page, pageSize, total } };
  }

  async getForCustomer(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== userId) throw new ForbiddenException('Not your order');
    return order;
  }

  // ── Admin-facing (FASE 6 §12) — global read-only supervision, no second state machine ─────

  async listForAdmin(query: {
    status?: OrderStatus;
    businessId?: string;
    search?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }) {
    const { skip, take, page, pageSize } = resolvePagination(query);
    const range = query.from || query.to ? resolveDateRange({ preset: 'custom', from: query.from, to: query.to }) : null;
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.businessId ? { businessId: query.businessId } : {}),
      ...(range ? { createdAt: { gte: range.from, lte: range.to } } : {}),
      ...(query.search
        ? {
            OR: [
              { orderNumber: { contains: query.search, mode: 'insensitive' as const } },
              { user: { firstName: { contains: query.search, mode: 'insensitive' as const } } },
              { user: { lastName: { contains: query.search, mode: 'insensitive' as const } } },
              { user: { email: { contains: query.search, mode: 'insensitive' as const } } },
              { business: { tradeName: { contains: query.search, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };
    const [total, orders] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: ORDER_INCLUDE }),
    ]);
    return { data: orders, meta: { page, pageSize, total } };
  }

  async getForAdmin(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { ...ORDER_INCLUDE, delivery: { include: { rider: { include: { user: true } } } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  // ── Business-facing (§32) ───────────────────────────────────────────────

  async listForBusiness(businessId: string, query: ListOrdersQueryDto) {
    const { skip, take, page, pageSize } = resolvePagination(query);
    const where = { businessId, ...(query.status ? { status: query.status } : {}) };
    const [total, orders] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: ORDER_INCLUDE,
      }),
    ]);
    return { data: orders, meta: { page, pageSize, total } };
  }

  async getForBusiness(businessId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
    if (!order) throw new NotFoundException('Order not found');
    if (order.businessId !== businessId) throw new ForbiddenException('Not your order');
    return order;
  }

  async updateStatusForBusiness(businessId: string, orderId: string, targetStatus: OrderStatus) {
    const order = await this.getForBusiness(businessId, orderId);
    if (!BUSINESS_SETTABLE_STATUSES.includes(targetStatus)) {
      throw new BadRequestException({
        error: {
          code: 'STATUS_NOT_BUSINESS_SETTABLE',
          message:
            'A business can only move an order through CONFIRMED, PREPARING, READY_FOR_PICKUP or ' +
            'COMPLETED — payment status and cancellation are handled elsewhere.',
        },
      });
    }
    // §14/24/59 (FASE 4): a DELIVERY order's READY_FOR_PICKUP/COMPLETED transitions are no longer
    // freely business-settable via this generic endpoint — READY_FOR_PICKUP must go through
    // POST .../orders/:id/ready-for-pickup (which also creates the Delivery), and COMPLETED is
    // only ever set by DeliverySyncService once the delivery is actually DELIVERED. PICKUP orders
    // are unaffected — this generic PATCH remains the whole story for them.
    if (
      order.fulfillmentType === FulfillmentType.DELIVERY &&
      (targetStatus === OrderStatus.READY_FOR_PICKUP || targetStatus === OrderStatus.COMPLETED)
    ) {
      throw new BadRequestException({
        error: {
          code: 'USE_DELIVERY_FLOW',
          message:
            targetStatus === OrderStatus.READY_FOR_PICKUP
              ? 'For DELIVERY orders, use POST .../orders/:id/ready-for-pickup instead — it also creates the delivery.'
              : 'For DELIVERY orders, COMPLETED is set automatically once the delivery is DELIVERED.',
        },
      });
    }
    this.stateMachine.assertTransition(order.status, targetStatus);
    return this.applyGuardedTransition(orderId, order.status, targetStatus);
  }

  /** The one sanctioned way to move ANY order to READY_FOR_PICKUP — used directly by the generic
   * PATCH above for PICKUP orders, and called by DeliveryModule's ready-for-pickup endpoint for
   * DELIVERY orders (which then goes on to create the Delivery in the same request). */
  async setReadyForPickup(businessId: string, orderId: string) {
    const order = await this.getForBusiness(businessId, orderId);
    this.stateMachine.assertTransition(order.status, OrderStatus.READY_FOR_PICKUP);
    return this.applyGuardedTransition(orderId, order.status, OrderStatus.READY_FOR_PICKUP);
  }

  /** §Parte 6 (FASE 4C): race-safe against two concurrent business staff both pressing the same
   * action (or one double-tap). A plain read-then-write — check `order.status` before this call,
   * then unconditionally UPDATE — would let two simultaneous requests both pass the state-machine
   * check and both "succeed", silently double-applying whatever side effect the caller has in
   * mind. The `updateMany` here is a compare-and-swap: it only actually moves the row when its
   * status still matches what this request originally read. Whichever request's guard matches
   * wins; the other gets a clear 400 instead of a false "success" on stale data — same pattern
   * already used for DeliveryService.complete()'s race condition (FASE 4B §79). */
  private async applyGuardedTransition(orderId: string, fromStatus: OrderStatus, toStatus: OrderStatus) {
    const { count } = await this.prisma.order.updateMany({
      where: { id: orderId, status: fromStatus },
      data: { status: toStatus },
    });
    if (count === 0) {
      throw new BadRequestException({
        error: {
          code: 'ORDER_ALREADY_UPDATED',
          message: 'This order was already updated — someone else got there first. Refresh and try again.',
        },
      });
    }
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_INCLUDE });

    const notif = ORDER_STATUS_NOTIFICATIONS[toStatus];
    if (notif) {
      void this.notifications.notify({
        userId: order.userId,
        audience: NotificationAudience.CUSTOMER,
        event: notif.event,
        title: notif.title,
        body: notif.body,
        entityType: 'Order',
        entityId: order.id,
        data: { orderId: order.id },
      });
    }

    return order;
  }
}
