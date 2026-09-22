import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DeliveryAssignmentAction, DeliveryStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DispatchService } from './dispatch.service';
import { DeliveryReassignmentService } from './delivery-reassignment.service';
import { DeliveryGateway } from './delivery.gateway';

/**
 * Plan item 5 / §44-45 gap fix: `assignmentTimeoutSeconds` was modeled on RiderDispatchConfig and
 * read into config, but nothing ever acted on it — a RIDER_ASSIGNED delivery could sit forever if
 * the rider never responded. This is a plain `@Cron` polling sweep over the DB (not a per-offer
 * `setTimeout`), so an outstanding offer is never lost across a Render restart/redeploy — matches
 * the "durable by construction" reasoning already used for this codebase's other background work.
 *
 * Reuses `DeliveryReassignmentService.reassign()` for the actual state transition, which is what
 * makes the plan §6 concurrency fix a prerequisite here: this sweeper runs fully independently of
 * a rider's own concurrent accept() call, so the conditional-updateMany guard inside reassign() is
 * what keeps the two from corrupting each other.
 */
@Injectable()
export class OfferTimeoutSweeper {
  private readonly logger = new Logger('OfferTimeoutSweeper');

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatch: DispatchService,
    private readonly reassignment: DeliveryReassignmentService,
    private readonly gateway: DeliveryGateway,
  ) {}

  @Cron('*/10 * * * * *')
  async sweep(): Promise<void> {
    const config = await this.dispatch.getConfig();
    const cutoff = new Date(Date.now() - config.assignmentTimeoutSeconds * 1000);

    const stale = await this.prisma.delivery.findMany({
      where: { status: DeliveryStatus.RIDER_ASSIGNED, assignedAt: { lt: cutoff } },
      select: { id: true },
    });
    if (stale.length === 0) return;

    for (const { id: deliveryId } of stale) {
      try {
        const newRiderId = await this.prisma.$transaction((tx) =>
          this.reassignment.reassign(tx, deliveryId, DeliveryAssignmentAction.TIMED_OUT, 'Rider did not respond in time'),
        );
        const updated = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
        if (updated) this.gateway.emitStatusUpdated(deliveryId, updated.status);
        if (newRiderId) {
          this.gateway.emitRiderAssigned(deliveryId, newRiderId);
          this.gateway.emitDeliveryOffer(newRiderId, deliveryId);
        }
      } catch (err) {
        // A concurrent accept() may have already resolved this delivery before this sweep's own
        // transaction committed — reassign() throws OFFER_NO_LONGER_AVAILABLE (ConflictException)
        // in that case, which is the *expected*, race-safe outcome, not a bug. Any other error is
        // logged and this delivery is simply retried on the next sweep rather than crashing the
        // whole batch over one bad row.
        const isExpectedRace = err instanceof ConflictException;
        this.logger.warn(
          `Timeout reassignment skipped for delivery ${deliveryId}${isExpectedRace ? ' (already resolved concurrently)' : ''}: ${(err as Error).message}`,
        );
      }
    }
  }
}
