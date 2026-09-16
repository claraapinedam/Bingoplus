import { Injectable } from '@nestjs/common';
import { DeliveryAssignmentAction, DeliveryAssignmentSource, DeliveryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DeliveryStateMachine } from './delivery-state-machine';

export interface RiderDispatchConfigValues {
  distanceWeight: number;
  ratingWeight: number;
  availabilityWeight: number;
  maxSearchRadiusKm: number;
  assignmentTimeoutSeconds: number;
}

/** All weights start at the schema defaults until Admin configures RiderDispatchConfig — never
 * hardcoded into the scoring math itself (same append-only-config pattern as PricingConfiguration). */
const DEFAULT_DISPATCH_CONFIG: RiderDispatchConfigValues = {
  distanceWeight: 0.5,
  ratingWeight: 0.3,
  availabilityWeight: 0.2,
  maxSearchRadiusKm: 10,
  assignmentTimeoutSeconds: 60,
};

export interface EligibleRiderCandidate {
  riderId: string;
  distanceKm: number;
  ratingAvg: number;
  score: number;
}

/** Delivery statuses that mean "this rider is already busy with something" — checked in addition
 * to availabilityStatus=AVAILABLE as defense-in-depth against double-offering a rider. */
const ACTIVE_DELIVERY_STATUSES: DeliveryStatus[] = [
  DeliveryStatus.RIDER_ASSIGNED,
  DeliveryStatus.RIDER_ACCEPTED,
  DeliveryStatus.GOING_TO_PICKUP,
  DeliveryStatus.ARRIVED_AT_PICKUP,
  DeliveryStatus.PICKED_UP,
  DeliveryStatus.IN_TRANSIT,
  DeliveryStatus.ARRIVED_AT_CUSTOMER,
];

/**
 * §17-20: finds and assigns riders. MVP scoring, not advanced AI dispatch (§5/19) — a weighted
 * sum of normalized distance and rating, all weights admin-configurable via RiderDispatchConfig.
 * "Availability" and "rider status" from the spec's priority list are hard filters here rather
 * than graded signals (a rider is either an eligible candidate or not), so availabilityWeight is
 * accepted/stored for forward-compatibility but doesn't currently differentiate among candidates
 * — every candidate in the result set is already ACTIVE+AVAILABLE.
 *
 * Proximity uses the PostGIS `geography(Point,4326)` columns already present on Rider/Business
 * since Phase 2 (previously unused — BusinessRankingService computed straight-line distance in
 * JS instead). RiderLocationService keeps Rider.currentLocation in sync via raw SQL, since
 * Prisma's `Unsupported` type can't be written through `data:`.
 */
@Injectable()
export class DispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: DeliveryStateMachine,
  ) {}

  async getConfig(): Promise<RiderDispatchConfigValues> {
    const config = await this.prisma.riderDispatchConfig.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!config) return DEFAULT_DISPATCH_CONFIG;
    return {
      distanceWeight: Number(config.distanceWeight),
      ratingWeight: Number(config.ratingWeight),
      availabilityWeight: Number(config.availabilityWeight),
      maxSearchRadiusKm: Number(config.maxSearchRadiusKm),
      assignmentTimeoutSeconds: config.assignmentTimeoutSeconds,
    };
  }

  async findEligibleRiders(
    originLat: number,
    originLng: number,
    excludeRiderIds: string[] = [],
  ): Promise<EligibleRiderCandidate[]> {
    const config = await this.getConfig();
    const maxRadiusMeters = config.maxSearchRadiusKm * 1000;

    const exclude = excludeRiderIds.length > 0 ? Prisma.sql`AND id NOT IN (${Prisma.join(excludeRiderIds)})` : Prisma.empty;

    const rows = await this.prisma.$queryRaw<{ id: string; ratingAvg: number; distanceMeters: number }[]>`
      SELECT id, "ratingAvg",
        ST_Distance("currentLocation", ST_SetSRID(ST_MakePoint(${originLng}, ${originLat}), 4326)::geography) AS "distanceMeters"
      FROM "Rider"
      WHERE "accountStatus" = 'ACTIVE'
        AND "availabilityStatus" = 'AVAILABLE'
        AND "currentLocation" IS NOT NULL
        AND ST_DWithin("currentLocation", ST_SetSRID(ST_MakePoint(${originLng}, ${originLat}), 4326)::geography, ${maxRadiusMeters})
        AND NOT EXISTS (
          SELECT 1 FROM "Delivery" d
          WHERE d."riderId" = "Rider".id AND d.status::text IN (${Prisma.join(ACTIVE_DELIVERY_STATUSES)})
        )
        ${exclude}
    `;

    return rows
      .map((r) => {
        const distanceKm = r.distanceMeters / 1000;
        const distanceScore = Math.max(0, 1 - distanceKm / config.maxSearchRadiusKm);
        const ratingScore = r.ratingAvg / 5;
        const score = distanceScore * config.distanceWeight + ratingScore * config.ratingWeight;
        return { riderId: r.id, distanceKm, ratingAvg: r.ratingAvg, score };
      })
      .sort((a, b) => b.score - a.score);
  }

  /** Writes the assignment and its audit trail (§20/23) — does not touch Rider.availabilityStatus,
   * which only flips to BUSY once the rider actually accepts (§10/21). */
  async assign(
    tx: Prisma.TransactionClient,
    deliveryId: string,
    riderId: string,
    source: DeliveryAssignmentSource,
  ): Promise<void> {
    const current = await tx.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
    this.stateMachine.assertTransition(current.status, DeliveryStatus.RIDER_ASSIGNED);

    await tx.delivery.update({
      where: { id: deliveryId },
      data: {
        riderId,
        status: DeliveryStatus.RIDER_ASSIGNED,
        assignedAt: new Date(),
        assignmentSource: source,
      },
    });
    await tx.deliveryAssignmentHistory.create({
      data: { deliveryId, riderId, action: DeliveryAssignmentAction.ASSIGNED, source },
    });
  }

  /**
   * §17: find the best candidate and assign them in one step. Returns the assigned rider id, or
   * null if no eligible rider was found within range (caller decides what "still searching" vs.
   * "failed" means — see DeliveryService.dispatch).
   */
  async dispatch(
    tx: Prisma.TransactionClient,
    deliveryId: string,
    originLat: number,
    originLng: number,
    excludeRiderIds: string[] = [],
  ): Promise<string | null> {
    const candidates = await this.findEligibleRiders(originLat, originLng, excludeRiderIds);
    const best = candidates[0];
    if (!best) return null;
    await this.assign(tx, deliveryId, best.riderId, DeliveryAssignmentSource.AUTO);
    return best.riderId;
  }
}
