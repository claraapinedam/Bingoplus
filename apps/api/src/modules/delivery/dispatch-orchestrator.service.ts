import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DispatchService } from './dispatch.service';

/**
 * Plan item 4 — progressive radius expansion. Tries each configured `radiusExpansionKm` step in
 * order, calling the existing `DispatchService.dispatch()` (unchanged) at each step and stopping
 * the moment a candidate is found. `DispatchService.assign()`'s own logic never changes — this is
 * a thin retry wrapper, not a rewrite of the dispatch engine. If every step yields zero candidates,
 * the Delivery simply stays `SEARCHING_RIDER` (never auto-FAILED) — `SearchingRiderRetrySweeper`
 * picks it up again later.
 */
@Injectable()
export class DispatchOrchestratorService {
  private readonly logger = new Logger('DispatchOrchestratorService');

  constructor(private readonly dispatchService: DispatchService) {}

  async dispatch(
    tx: Prisma.TransactionClient,
    deliveryId: string,
    originLat: number,
    originLng: number,
    excludeRiderIds: string[] = [],
  ): Promise<string | null> {
    const config = await this.dispatchService.getConfig();
    const steps = config.radiusExpansionKm.length > 0 ? config.radiusExpansionKm : [config.maxSearchRadiusKm];

    for (const radiusKm of steps) {
      const riderId = await this.dispatchService.dispatch(tx, deliveryId, originLat, originLng, excludeRiderIds, radiusKm);
      if (riderId) return riderId;
    }

    this.logger.log(
      `No eligible rider for delivery ${deliveryId} across radius steps [${steps.join(', ')}km] — staying SEARCHING_RIDER for retry.`,
    );
    return null;
  }
}
