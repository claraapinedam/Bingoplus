import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DeliveryAssignmentAction, DeliveryStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DispatchService } from './dispatch.service';
import { DispatchOrchestratorService } from './dispatch-orchestrator.service';
import { DeliveryGateway } from './delivery.gateway';

interface PickupSnapshot {
  latitude?: number;
  longitude?: number;
}

/**
 * Plan item 5 — the "wait, search again, expand radius" fallback: finds Delivery rows stuck at
 * SEARCHING_RIDER (zero eligible riders were found at the time of the last attempt, or ever, e.g.
 * an order created when literally no rider was online) and re-runs DispatchOrchestratorService for
 * them once `retryBackoffSeconds` has passed since the last attempt. A plain DB poll, same
 * durable-by-construction reasoning as OfferTimeoutSweeper — no per-delivery timers to lose on a
 * Render restart.
 *
 * `maxDispatchAttempts` is a pure safety valve (plan §8): once a delivery has accumulated that many
 * ASSIGNED attempts, this sweeper stops touching it — it never auto-FAILS the delivery, it just
 * stops auto-retrying so it surfaces for manual admin attention instead of retrying forever.
 */
@Injectable()
export class SearchingRiderRetrySweeper {
  private readonly logger = new Logger('SearchingRiderRetrySweeper');

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatch: DispatchService,
    private readonly orchestrator: DispatchOrchestratorService,
    private readonly gateway: DeliveryGateway,
  ) {}

  @Cron('*/15 * * * * *')
  async sweep(): Promise<void> {
    const config = await this.dispatch.getConfig();
    const cutoff = new Date(Date.now() - config.retryBackoffSeconds * 1000);

    const candidates = await this.prisma.delivery.findMany({
      where: { status: DeliveryStatus.SEARCHING_RIDER, createdAt: { lt: cutoff } },
      select: { id: true, createdAt: true, pickupAddressSnapshot: true },
    });
    if (candidates.length === 0) return;

    for (const delivery of candidates) {
      const lastAttempt = await this.prisma.deliveryAssignmentHistory.findFirst({
        where: { deliveryId: delivery.id },
        orderBy: { createdAt: 'desc' },
      });
      const referenceTime = lastAttempt?.createdAt ?? delivery.createdAt;
      if (referenceTime > cutoff) continue; // still inside the backoff window since the last attempt

      const attemptCount = await this.prisma.deliveryAssignmentHistory.count({
        where: { deliveryId: delivery.id, action: DeliveryAssignmentAction.ASSIGNED },
      });
      if (attemptCount >= config.maxDispatchAttempts) continue; // safety valve — see class comment

      const snapshot = delivery.pickupAddressSnapshot as unknown as PickupSnapshot;
      if (snapshot?.latitude == null || snapshot?.longitude == null) continue;

      try {
        const excludeRiderIds = (
          await this.prisma.deliveryAssignmentHistory.findMany({
            where: { deliveryId: delivery.id, riderId: { not: null } },
            select: { riderId: true },
            distinct: ['riderId'],
          })
        ).map((h) => h.riderId!);

        const assignedRiderId = await this.prisma.$transaction((tx) =>
          this.orchestrator.dispatch(tx, delivery.id, snapshot.latitude!, snapshot.longitude!, excludeRiderIds),
        );
        if (assignedRiderId) {
          this.gateway.emitStatusUpdated(delivery.id, DeliveryStatus.RIDER_ASSIGNED);
          this.gateway.emitRiderAssigned(delivery.id, assignedRiderId);
          this.gateway.emitDeliveryOffer(assignedRiderId, delivery.id);
        }
      } catch (err) {
        this.logger.warn(`Retry dispatch failed for delivery ${delivery.id}: ${(err as Error).message}`);
      }
    }
  }
}
