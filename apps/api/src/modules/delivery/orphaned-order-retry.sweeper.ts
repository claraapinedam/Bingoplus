import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FulfillmentType, OrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DeliveryService } from './delivery.service';

/**
 * BusinessDeliveryController.readyForPickup moves the Order to READY_FOR_PICKUP and then calls
 * DeliveryService.createForOrder() as two separate, non-transactional steps — the order flip is
 * already committed by the time createForOrder runs. If createForOrder throws for any reason
 * (transient geocoding failure, a momentary DB hiccup, etc.), the order is left stuck at
 * READY_FOR_PICKUP with no Delivery row at all — and with no way for the business to retry, since
 * the order state machine has no READY_FOR_PICKUP -> READY_FOR_PICKUP transition to re-trigger it.
 * This sweeper is the backstop: it finds exactly that orphaned state (a DELIVERY order sitting at
 * READY_FOR_PICKUP with no related Delivery) and retries createForOrder for it, same polling-sweep
 * pattern as SearchingRiderRetrySweeper/OfferTimeoutSweeper — nothing to lose on a Render restart.
 */
@Injectable()
export class OrphanedOrderRetrySweeper {
  private readonly logger = new Logger('OrphanedOrderRetrySweeper');

  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: DeliveryService,
  ) {}

  @Cron('*/20 * * * * *')
  async sweep(): Promise<void> {
    const orphans = await this.prisma.order.findMany({
      where: { fulfillmentType: FulfillmentType.DELIVERY, status: OrderStatus.READY_FOR_PICKUP, delivery: null },
      select: { id: true },
    });
    if (orphans.length === 0) return;

    for (const order of orphans) {
      try {
        await this.delivery.createForOrder(order.id);
        this.logger.warn(`Recovered orphaned READY_FOR_PICKUP order ${order.id} — Delivery created on retry.`);
      } catch (err) {
        this.logger.warn(`Retry createForOrder still failing for order ${order.id}: ${(err as Error).message}`);
      }
    }
  }
}
