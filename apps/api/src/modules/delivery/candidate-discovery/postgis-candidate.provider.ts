import { Injectable } from '@nestjs/common';
import { DeliveryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CandidateDiscoveryProvider, CandidateLocation, CandidateOrigin } from './candidate-discovery.interface';

/** Delivery statuses that mean "this rider is already busy with something" — checked in addition
 * to availabilityStatus=AVAILABLE as defense-in-depth against double-offering a rider. Moved here
 * verbatim from the old DispatchService.findEligibleRiders. */
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
 * The sole `CandidateDiscoveryProvider` implementation today — the exact `ST_DWithin`/`ST_Distance`
 * raw-SQL query that used to live directly in DispatchService.findEligibleRiders, moved here
 * verbatim (plus `lastLocationAt`/`currentLatitude`/`currentLongitude` added to the SELECT, which
 * the caller needs for the staleness filter and the real ETA call — see EtaRankingService).
 */
@Injectable()
export class PostgisCandidateProvider extends CandidateDiscoveryProvider {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findCandidates(origin: CandidateOrigin, radiusKm: number, excludeRiderIds: string[] = []): Promise<CandidateLocation[]> {
    const maxRadiusMeters = radiusKm * 1000;
    const exclude = excludeRiderIds.length > 0 ? Prisma.sql`AND id NOT IN (${Prisma.join(excludeRiderIds)})` : Prisma.empty;

    const rows = await this.prisma.$queryRaw<
      { id: string; ratingAvg: number; distanceMeters: number; lastLocationAt: Date | null; currentLatitude: number; currentLongitude: number }[]
    >`
      SELECT id, "ratingAvg", "lastLocationAt", "currentLatitude", "currentLongitude",
        ST_Distance("currentLocation", ST_SetSRID(ST_MakePoint(${origin.longitude}, ${origin.latitude}), 4326)::geography) AS "distanceMeters"
      FROM "Rider"
      WHERE "accountStatus" = 'ACTIVE'
        AND "availabilityStatus" = 'AVAILABLE'
        AND "currentLocation" IS NOT NULL
        AND ST_DWithin("currentLocation", ST_SetSRID(ST_MakePoint(${origin.longitude}, ${origin.latitude}), 4326)::geography, ${maxRadiusMeters})
        AND NOT EXISTS (
          SELECT 1 FROM "Delivery" d
          WHERE d."riderId" = "Rider".id AND d.status::text IN (${Prisma.join(ACTIVE_DELIVERY_STATUSES)})
        )
        ${exclude}
    `;

    return rows.map((r) => ({
      riderId: r.id,
      distanceKm: r.distanceMeters / 1000,
      ratingAvg: r.ratingAvg,
      latitude: r.currentLatitude,
      longitude: r.currentLongitude,
      lastLocationAt: r.lastLocationAt,
    }));
  }
}
