import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DeliveryAssignmentAction,
  DeliveryAssignmentSource,
  DeliveryIncidentType,
  DeliveryStatus,
  NotificationAudience,
  Prisma,
  RiderAccountStatus,
  RiderAvailabilityStatus,
  RiderEarningStatus,
  RiderEarningType,
} from '@prisma/client';
import { resolveDateRange } from '@bingoplus/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { DeliveryEligibilityService } from './delivery-eligibility.service';
import { DeliveryStateMachine } from './delivery-state-machine';
import { DispatchService } from './dispatch.service';
import { DeliveryReassignmentService } from './delivery-reassignment.service';
import { DeliveryProofService } from './delivery-proof.service';
import { DeliverySyncService } from './delivery-sync.service';
import { MapService } from '../maps/map.service';
import { NotificationService } from '../notifications/notification.service';
import { DeliveryGateway } from './delivery.gateway';
import { DeliveryFareConfigService } from './delivery-fare-config.service';

interface AddressSnapshot {
  line1?: string;
  line2?: string | null;
  city?: string;
  latitude?: number | null;
  longitude?: number | null;
}

const DELIVERY_INCLUDE = { rider: { include: { user: true, vehicles: true } }, order: true } satisfies Prisma.DeliveryInclude;

/** Admin-only (FASE 6 §11/14) — richer than DELIVERY_INCLUDE above (which every customer/business/
 * rider-facing method also uses) so the admin list/detail views can show business+customer names
 * without a second round trip. Kept separate rather than widening the shared constant, since that
 * one is on hot paths this doesn't need to add weight to. */
const ADMIN_DELIVERY_INCLUDE = {
  rider: { include: { user: true, vehicles: true } },
  order: { include: { business: { select: { id: true, tradeName: true } }, user: { select: { firstName: true, lastName: true } } } },
} satisfies Prisma.DeliveryInclude;

/**
 * §11/14/21/26-29/32: the main orchestrator — creation trigger and every rider-facing task
 * transition. Deliberately thin on business logic that already has its own service
 * (eligibility/dispatch/reassignment/proof/sync) and instead composes them under one
 * ownership-checked, transactional surface.
 */
@Injectable()
export class DeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibility: DeliveryEligibilityService,
    private readonly stateMachine: DeliveryStateMachine,
    private readonly dispatch: DispatchService,
    private readonly reassignment: DeliveryReassignmentService,
    private readonly proof: DeliveryProofService,
    private readonly sync: DeliverySyncService,
    private readonly maps: MapService,
    private readonly notifications: NotificationService,
    private readonly gateway: DeliveryGateway,
    private readonly fareConfig: DeliveryFareConfigService,
  ) {}

  // ── Creation (§14/24) ──────────────────────────────────────────────────

  async createForOrder(orderId: string) {
    const order = await this.eligibility.assertEligible(orderId);
    const business = order.business;
    const addressSnapshot = (order.deliveryAddressSnapshot ?? {}) as AddressSnapshot;

    const pickupCoords = { latitude: business.latitude!, longitude: business.longitude! };
    let deliveryCoords =
      addressSnapshot.latitude != null && addressSnapshot.longitude != null
        ? { latitude: addressSnapshot.latitude, longitude: addressSnapshot.longitude }
        : null;

    if (!deliveryCoords) {
      // §43: resolve via geocoding when the snapshot has no coordinates yet.
      const line = [addressSnapshot.line1, addressSnapshot.line2, addressSnapshot.city].filter(Boolean).join(', ');
      const geocoded = line ? await this.maps.geocode(line).catch(() => null) : null;
      deliveryCoords = geocoded ? { latitude: geocoded.latitude, longitude: geocoded.longitude } : null;
    }

    // §70: Maps failing must never break order creation — route/ETA are optional at this stage.
    const route = deliveryCoords ? await this.maps.calculateRouteSafe(pickupCoords, deliveryCoords) : null;

    // The geocoding fallback above only resolved `deliveryCoords` in memory for the route/ETA
    // calculation — it was never written back onto the snapshot that Rider/Customer/Business
    // actually read to render a map pin, so a customer address saved without lat/lng permanently
    // showed no destination marker even after a successful geocode. Persist whatever coordinates
    // we ended up with (explicit snapshot values, or the geocoded fallback) onto the snapshot.
    const deliveryAddressSnapshot = order.deliveryAddressSnapshot
      ? { ...(order.deliveryAddressSnapshot as object), ...(deliveryCoords ?? {}) }
      : Prisma.JsonNull;

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.delivery.create({
        data: {
          orderId: order.id,
          status: DeliveryStatus.PENDING,
          pickupAddressSnapshot: {
            tradeName: business.tradeName,
            addressLine: business.addressLine,
            city: business.city,
            latitude: business.latitude,
            longitude: business.longitude,
          },
          deliveryAddressSnapshot,
          deliveryFee: order.deliveryFee,
          estimatedDistanceKm: route?.distanceKm,
          estimatedDurationMinutes: route?.durationMinutes,
          route: route ? { polyline: route.polyline, steps: route.steps } : undefined,
        },
      });
      await this.proof.generateOtp(tx, created.id);
      await tx.delivery.update({ where: { id: created.id }, data: { status: DeliveryStatus.SEARCHING_RIDER } });
      const assignedRiderId = await this.dispatch.dispatch(tx, created.id, pickupCoords.latitude, pickupCoords.longitude);

      return { delivery: await tx.delivery.findUniqueOrThrow({ where: { id: created.id }, include: DELIVERY_INCLUDE }), assignedRiderId };
    }).then(({ delivery, assignedRiderId }) => {
      this.gateway.emitStatusUpdated(delivery.id, delivery.status);
      if (assignedRiderId) {
        this.gateway.emitRiderAssigned(delivery.id, assignedRiderId);
        this.gateway.emitDeliveryOffer(assignedRiderId, delivery.id);
      }
      return delivery;
    });
  }

  // ── Rider task actions (§21/25-27/29-32) ──────────────────────────────

  async getForRider(riderId: string, deliveryId: string) {
    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId }, include: DELIVERY_INCLUDE });
    if (!delivery) throw new NotFoundException('Delivery not found');
    if (delivery.riderId !== riderId) throw new ForbiddenException('This delivery is not assigned to you');
    return delivery;
  }

  listForRider(riderId: string) {
    return this.prisma.delivery.findMany({
      where: { riderId },
      include: DELIVERY_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** RIDER_ASSIGNED -> RIDER_ACCEPTED -> GOING_TO_PICKUP: accepting already implies starting
   * navigation, so there's no separate "start heading to pickup" endpoint (§57 lists 8 rider
   * actions, not 9) — both transitions happen atomically here. */
  async accept(riderId: string, deliveryId: string) {
    const delivery = await this.getForRider(riderId, deliveryId);
    this.stateMachine.assertTransition(delivery.status, DeliveryStatus.RIDER_ACCEPTED);

    const rider = await this.prisma.rider.findUniqueOrThrow({ where: { id: riderId } });
    if (rider.accountStatus !== RiderAccountStatus.ACTIVE) {
      throw new ForbiddenException('Your account is not currently active');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.delivery.update({
        where: { id: deliveryId },
        data: { status: DeliveryStatus.RIDER_ACCEPTED, acceptedAt: new Date() },
      });
      await tx.deliveryAssignmentHistory.create({
        data: { deliveryId, riderId, action: DeliveryAssignmentAction.ACCEPTED, source: 'AUTO' },
      });
      await tx.rider.update({ where: { id: riderId }, data: { availabilityStatus: RiderAvailabilityStatus.BUSY } });
      this.stateMachine.assertTransition(DeliveryStatus.RIDER_ACCEPTED, DeliveryStatus.GOING_TO_PICKUP);
      await tx.delivery.update({ where: { id: deliveryId }, data: { status: DeliveryStatus.GOING_TO_PICKUP } });
      return tx.delivery.findUniqueOrThrow({ where: { id: deliveryId }, include: DELIVERY_INCLUDE });
    }).then((updated) => {
      this.gateway.emitStatusUpdated(deliveryId, updated.status);
      this.notifications.notify({
        userId: updated.order.userId,
        audience: NotificationAudience.CUSTOMER,
        event: 'delivery.rider_accepted',
        title: 'Tu repartidor está en camino',
        body: 'Un repartidor aceptó tu pedido y va camino al negocio.',
        data: { deliveryId },
      });
      return updated;
    });
  }

  /** §21/75: rejection never cancels the Order — it goes back to dispatch for another rider. */
  async reject(riderId: string, deliveryId: string, reason?: string) {
    const delivery = await this.getForRider(riderId, deliveryId);
    if (delivery.status !== DeliveryStatus.RIDER_ASSIGNED) {
      throw new BadRequestException({
        error: { code: 'DELIVERY_NOT_REJECTABLE', message: 'This delivery is not currently offered to you.' },
      });
    }
    const newRiderId = await this.prisma.$transaction((tx) =>
      this.reassignment.reassign(tx, deliveryId, DeliveryAssignmentAction.REJECTED, reason),
    );
    const updated = await this.prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId }, include: DELIVERY_INCLUDE });
    this.gateway.emitStatusUpdated(deliveryId, updated.status);
    if (newRiderId) {
      this.gateway.emitRiderAssigned(deliveryId, newRiderId);
      this.gateway.emitDeliveryOffer(newRiderId, deliveryId);
    }
    return updated;
  }

  async arrivedAtPickup(riderId: string, deliveryId: string) {
    return this.transition(riderId, deliveryId, DeliveryStatus.ARRIVED_AT_PICKUP, {});
  }

  async pickedUp(riderId: string, deliveryId: string) {
    const updated = await this.transition(riderId, deliveryId, DeliveryStatus.PICKED_UP, { pickedUpAt: new Date() });
    await this.notifications.notify({
      userId: updated.order.userId,
      audience: NotificationAudience.CUSTOMER,
      event: 'delivery.picked_up',
      title: 'Tu pedido va en camino',
      body: 'El repartidor recogió tu pedido en el negocio.',
      data: { deliveryId },
    });
    return updated;
  }

  async start(riderId: string, deliveryId: string) {
    return this.transition(riderId, deliveryId, DeliveryStatus.IN_TRANSIT, {});
  }

  async arrivedAtCustomer(riderId: string, deliveryId: string) {
    const updated = await this.transition(riderId, deliveryId, DeliveryStatus.ARRIVED_AT_CUSTOMER, {});
    await this.notifications.notify({
      userId: updated.order.userId,
      audience: NotificationAudience.CUSTOMER,
      event: 'delivery.rider_arrived',
      title: 'Tu repartidor llegó',
      body: 'El repartidor está en la dirección de entrega.',
      data: { deliveryId },
    });
    return updated;
  }

  /** §31/32/79: OTP-gated, and race-safe against two completions — both truly concurrent
   * (two in-flight requests) and sequential (the user's client retries or double-taps after the
   * first one already succeeded). The status write is a conditional `updateMany` guarded by
   * `status: ARRIVED_AT_CUSTOMER` — a plain read-then-write (checking `delivery.status` before
   * the transaction, then writing inside it) would let two simultaneous requests both pass the
   * check and both create a RiderEarning. Whichever request's updateMany actually matches a row
   * wins and proceeds; the loser sees matchedCount 0. A *sequential* repeat call arrives after
   * status is already DELIVERED — DeliveryStateMachine has no outgoing transition from a
   * terminal state, so that's handled as its own early return rather than an error, same pattern
   * as CheckoutService.confirm() already uses for an already-resolved payment. */
  async complete(riderId: string, deliveryId: string, otpCode: string) {
    const delivery = await this.getForRider(riderId, deliveryId);
    if (delivery.status === DeliveryStatus.DELIVERED) return delivery;
    this.stateMachine.assertTransition(delivery.status, DeliveryStatus.DELIVERED);
    await this.proof.verify(deliveryId, otpCode);

    // Reads the *current* DeliveryFareConfig, same "latest row wins" convention as every other
    // append-only config in this codebase — not snapshotted at fare-quote time, since a rate
    // change is expected to apply going forward, not retroactively re-litigate an already-quoted
    // fare's split. The commission percent specifically may instead come from this rider's own
    // live RiderCommissionOverride (a redeemed CommissionCoupon) — see
    // DeliveryFareConfigService.getEffectiveCommissionPercent.
    const fareConfig = await this.fareConfig.get();
    const bingoCommissionPercent = await this.fareConfig.getEffectiveCommissionPercent(riderId);
    const grossAmount = new Prisma.Decimal(delivery.deliveryFee);
    const commissionAmount = grossAmount.mul(bingoCommissionPercent);
    const taxWithheldAmount = grossAmount.minus(commissionAmount).mul(fareConfig.riderTaxWithholdingPercent);
    const netAmount = grossAmount.minus(commissionAmount).minus(taxWithheldAmount);

    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.delivery.updateMany({
        where: { id: deliveryId, status: DeliveryStatus.ARRIVED_AT_CUSTOMER },
        data: {
          status: DeliveryStatus.DELIVERED,
          deliveredAt: new Date(),
          actualDistanceKm: delivery.estimatedDistanceKm,
          actualDurationMinutes: delivery.estimatedDurationMinutes,
        },
      });
      if (count === 0) {
        // Someone else's request already completed this delivery — idempotent no-op.
        return tx.delivery.findUniqueOrThrow({ where: { id: deliveryId }, include: DELIVERY_INCLUDE });
      }
      await this.sync.onDeliveryStatusChanged(tx, delivery.orderId, DeliveryStatus.DELIVERED);
      await tx.riderEarning.create({
        data: {
          riderId,
          deliveryId,
          grossAmount,
          commissionAmount,
          taxWithheldAmount,
          netAmount,
          type: RiderEarningType.DELIVERY_FEE,
          status: RiderEarningStatus.PENDING,
        },
      });
      await tx.rider.update({
        where: { id: riderId },
        data: { availabilityStatus: RiderAvailabilityStatus.AVAILABLE, deliveriesCompleted: { increment: 1 } },
      });
      return tx.delivery.findUniqueOrThrow({ where: { id: deliveryId }, include: DELIVERY_INCLUDE });
    }).then(async (updated) => {
      this.gateway.emitStatusUpdated(deliveryId, updated.status);
      this.gateway.emitCompleted(deliveryId);
      await this.notifications.notify({
        userId: updated.order.userId,
        audience: NotificationAudience.CUSTOMER,
        event: 'delivery.completed',
        title: '¡Pedido entregado!',
        body: 'Tu pedido fue entregado con éxito.',
        data: { deliveryId },
      });
      return updated;
    });
  }

  async reportIncident(riderId: string, deliveryId: string, type: DeliveryIncidentType, description?: string) {
    const delivery = await this.getForRider(riderId, deliveryId);
    const rider = await this.prisma.rider.findUniqueOrThrow({ where: { id: riderId } });
    return this.prisma.deliveryIncident.create({
      data: { deliveryId: delivery.id, reportedBy: rider.userId, type, description },
    });
  }

  private async transition(
    riderId: string,
    deliveryId: string,
    target: DeliveryStatus,
    extraData: Prisma.DeliveryUpdateInput,
  ) {
    const delivery = await this.getForRider(riderId, deliveryId);
    this.stateMachine.assertTransition(delivery.status, target);
    const updated = await this.prisma.delivery.update({
      where: { id: deliveryId },
      data: { status: target, ...extraData },
      include: DELIVERY_INCLUDE,
    });
    this.gateway.emitStatusUpdated(deliveryId, target);
    return updated;
  }

  // ── Reads for other actors ─────────────────────────────────────────────

  async getForCustomer(userId: string, deliveryId: string) {
    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId }, include: DELIVERY_INCLUDE });
    if (!delivery) throw new NotFoundException('Delivery not found');
    if (delivery.order.userId !== userId) throw new ForbiddenException('Not your order');
    return delivery;
  }

  async getForOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== userId) throw new ForbiddenException('Not your order');
    const delivery = await this.prisma.delivery.findUnique({ where: { orderId }, include: DELIVERY_INCLUDE });
    if (!delivery) throw new NotFoundException('This order has no delivery yet');
    return delivery;
  }

  /** §FASE 4C: unlike getForOrder, never 404s just because no Delivery exists yet — the tracking
   * timeline needs to render the Order-level steps (confirmed/preparing/ready) that happen
   * *before* a Delivery is created, not just once one exists. */
  async getTrackingForOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== userId) throw new ForbiddenException('Not your order');
    const delivery = await this.prisma.delivery.findUnique({ where: { orderId }, include: DELIVERY_INCLUDE });
    return { order, delivery };
  }

  async getForBusiness(businessId: string, deliveryId: string) {
    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId }, include: DELIVERY_INCLUDE });
    if (!delivery) throw new NotFoundException('Delivery not found');
    if (delivery.order.businessId !== businessId) throw new ForbiddenException('Not your delivery');
    return delivery;
  }

  /** FASE 4C gap fix: Order Detail needs "the delivery for this order" — previously only
   * lookup-by-deliveryId or list-everything existed for the business side. Returns null rather
   * than 404 when there's no Delivery yet (DELIVERY order not at READY_FOR_PICKUP, or PICKUP). */
  async getForBusinessByOrder(businessId: string, orderId: string) {
    const delivery = await this.prisma.delivery.findUnique({ where: { orderId }, include: DELIVERY_INCLUDE });
    if (!delivery) return null;
    if (delivery.order.businessId !== businessId) throw new ForbiddenException('Not your delivery');
    return delivery;
  }

  listForBusiness(businessId: string) {
    return this.prisma.delivery.findMany({
      where: { order: { businessId } },
      include: DELIVERY_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getForAdmin(deliveryId: string) {
    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId }, include: ADMIN_DELIVERY_INCLUDE });
    if (!delivery) throw new NotFoundException('Delivery not found');
    return delivery;
  }

  listForAdmin(params: { status?: DeliveryStatus; riderId?: string; userId?: string; from?: string; to?: string }) {
    // Absent from/to means genuinely unbounded here (an operational list, not an analytics view
    // that always resolves to *some* period) — resolveDateRange only gets called when at least one
    // bound was actually given, reusing its date-only-vs-exact-hour parsing either way.
    const range = params.from || params.to ? resolveDateRange({ preset: 'custom', from: params.from, to: params.to }) : null;
    return this.prisma.delivery.findMany({
      where: {
        ...(params.status ? { status: params.status } : {}),
        ...(params.riderId ? { riderId: params.riderId } : {}),
        ...(params.userId ? { order: { userId: params.userId } } : {}),
        ...(range ? { createdAt: { gte: range.from, lte: range.to } } : {}),
      },
      include: ADMIN_DELIVERY_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Admin overrides (§17/20/50/60) ─────────────────────────────────────

  /** §20/60: admin manually assigns/reassigns a specific rider — allowed any time before physical
   * pickup. If someone was already offered/assigned, they're freed and the move is recorded as a
   * REASSIGNED history entry before the new ADMIN-sourced assignment. */
  async adminAssign(deliveryId: string, riderId: string) {
    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) throw new NotFoundException('Delivery not found');
    if (!this.stateMachine.isCancellable(delivery.status)) {
      throw new BadRequestException({
        error: {
          code: 'DELIVERY_NOT_REASSIGNABLE',
          message: 'This delivery can no longer be reassigned — it has already been picked up.',
        },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      if (delivery.riderId) {
        await tx.deliveryAssignmentHistory.create({
          data: {
            deliveryId,
            riderId: delivery.riderId,
            action: DeliveryAssignmentAction.REASSIGNED,
            source: DeliveryAssignmentSource.ADMIN,
          },
        });
        await tx.rider.update({
          where: { id: delivery.riderId },
          data: { availabilityStatus: RiderAvailabilityStatus.AVAILABLE },
        });
        await tx.delivery.update({ where: { id: deliveryId }, data: { riderId: null, status: DeliveryStatus.SEARCHING_RIDER } });
      } else if (delivery.status === DeliveryStatus.PENDING) {
        this.stateMachine.assertTransition(DeliveryStatus.PENDING, DeliveryStatus.SEARCHING_RIDER);
        await tx.delivery.update({ where: { id: deliveryId }, data: { status: DeliveryStatus.SEARCHING_RIDER } });
      }
      await this.dispatch.assign(tx, deliveryId, riderId, DeliveryAssignmentSource.ADMIN);
      return tx.delivery.findUniqueOrThrow({ where: { id: deliveryId }, include: DELIVERY_INCLUDE });
    }).then((updated) => {
      this.gateway.emitStatusUpdated(deliveryId, updated.status);
      this.gateway.emitRiderAssigned(deliveryId, riderId);
      this.gateway.emitDeliveryOffer(riderId, deliveryId);
      return updated;
    });
  }
}
