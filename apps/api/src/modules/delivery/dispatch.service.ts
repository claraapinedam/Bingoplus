import { Inject, Injectable } from '@nestjs/common';
import { DeliveryAssignmentAction, DeliveryAssignmentSource, DeliveryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DeliveryStateMachine } from './delivery-state-machine';
import { CANDIDATE_DISCOVERY_TOKEN, CandidateDiscoveryProvider } from './candidate-discovery/candidate-discovery.interface';
import { EtaRankingService, RankedCandidate } from './eta-ranking.service';

export interface RiderDispatchConfigValues {
  distanceWeight: number;
  ratingWeight: number;
  availabilityWeight: number;
  maxSearchRadiusKm: number;
  assignmentTimeoutSeconds: number;
  // Dispatch V2 fields — see RiderDispatchConfig in schema.prisma for the full rationale.
  etaWeight: number;
  maxCandidatesForEta: number;
  locationStaleThresholdSeconds: number;
  radiusExpansionKm: number[];
  retryBackoffSeconds: number;
  maxDispatchAttempts: number;
}

/** All weights start at the schema defaults until Admin configures RiderDispatchConfig — never
 * hardcoded into the scoring math itself (same append-only-config pattern as PricingConfiguration). */
const DEFAULT_DISPATCH_CONFIG: RiderDispatchConfigValues = {
  distanceWeight: 0.5,
  ratingWeight: 0.3,
  availabilityWeight: 0.2,
  maxSearchRadiusKm: 10,
  assignmentTimeoutSeconds: 60,
  etaWeight: 0.6,
  maxCandidatesForEta: 8,
  locationStaleThresholdSeconds: 120,
  radiusExpansionKm: [2, 4, 6, 8],
  retryBackoffSeconds: 15,
  maxDispatchAttempts: 20,
};

export type EligibleRiderCandidate = RankedCandidate;

/**
 * §17-20: finds and assigns riders. MVP scoring, not advanced AI dispatch (§5/19) — a weighted sum
 * of normalized ETA, distance and rating, all weights admin-configurable via RiderDispatchConfig.
 * "Availability" and "rider status" from the spec's priority list are hard filters here rather
 * than graded signals (a rider is either an eligible candidate or not), so availabilityWeight is
 * accepted/stored for forward-compatibility but doesn't currently differentiate among candidates
 * — every candidate in the result set is already ACTIVE+AVAILABLE.
 *
 * Candidate discovery (the PostGIS radius search) lives behind `CandidateDiscoveryProvider` (see
 * ./candidate-discovery) — this service never talks to PostGIS or the Maps API directly, it only
 * composes the candidate provider + EtaRankingService, exactly like DeliveryService composes its
 * own sub-services. Radius-expansion/retry orchestration lives one layer up in
 * DispatchOrchestratorService — this class always searches a single radius per call.
 */
@Injectable()
export class DispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: DeliveryStateMachine,
    @Inject(CANDIDATE_DISCOVERY_TOKEN) private readonly candidateProvider: CandidateDiscoveryProvider,
    private readonly etaRanking: EtaRankingService,
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
      etaWeight: Number(config.etaWeight),
      maxCandidatesForEta: config.maxCandidatesForEta,
      locationStaleThresholdSeconds: config.locationStaleThresholdSeconds,
      radiusExpansionKm: config.radiusExpansionKm,
      retryBackoffSeconds: config.retryBackoffSeconds,
      maxDispatchAttempts: config.maxDispatchAttempts,
    };
  }

  /** Admin write path for RiderDispatchConfig (mirrors DeliveryFareConfigService.set — append-only
   * history, latest row wins). Takes the same shape getConfig() returns rather than the DTO class
   * directly, so this service never has to import the admin-facing validation DTO. */
  async set(values: RiderDispatchConfigValues, updatedBy?: string): Promise<RiderDispatchConfigValues> {
    await this.prisma.riderDispatchConfig.create({ data: { ...values, updatedBy } });
    return values;
  }

  async findEligibleRiders(
    originLat: number,
    originLng: number,
    excludeRiderIds: string[] = [],
    radiusKmOverride?: number,
  ): Promise<EligibleRiderCandidate[]> {
    const config = await this.getConfig();
    const radiusKm = radiusKmOverride ?? config.maxSearchRadiusKm;

    const rawCandidates = await this.candidateProvider.findCandidates({ latitude: originLat, longitude: originLng }, radiusKm, excludeRiderIds);

    // §2 of the plan: GPS staleness filter, applied in JS so the SQL query itself stays untouched
    // in PostgisCandidateProvider — reject any candidate whose last known location is older than
    // the configured threshold, however close it looked on paper.
    const staleThresholdMs = config.locationStaleThresholdSeconds * 1000;
    const now = Date.now();
    const fresh = rawCandidates.filter((c) => c.lastLocationAt != null && now - c.lastLocationAt.getTime() <= staleThresholdMs);
    if (fresh.length === 0) return [];

    return this.etaRanking.rank(
      fresh,
      { latitude: originLat, longitude: originLng },
      { etaWeight: config.etaWeight, distanceWeight: config.distanceWeight, ratingWeight: config.ratingWeight, radiusKm },
      config.maxCandidatesForEta,
    );
  }

  /** Writes the assignment and its audit trail (§20/23) — does not touch Rider.availabilityStatus,
   * which only flips to BUSY once the rider actually accepts (§10/21). `meta` carries whatever
   * EtaRankingService already computed for the winning candidate, so DeliveryAssignmentHistory can
   * store it without recomputing anything. */
  async assign(
    tx: Prisma.TransactionClient,
    deliveryId: string,
    riderId: string,
    source: DeliveryAssignmentSource,
    meta?: { estimatedDistanceKm?: number; estimatedETAMinutes?: number | null },
  ): Promise<void> {
    const current = await tx.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
    this.stateMachine.assertTransition(current.status, DeliveryStatus.RIDER_ASSIGNED);

    const priorAssignedCount = await tx.deliveryAssignmentHistory.count({
      where: { deliveryId, action: DeliveryAssignmentAction.ASSIGNED },
    });

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
      data: {
        deliveryId,
        riderId,
        action: DeliveryAssignmentAction.ASSIGNED,
        source,
        estimatedDistanceKm: meta?.estimatedDistanceKm != null ? new Prisma.Decimal(meta.estimatedDistanceKm) : undefined,
        estimatedETAMinutes: meta?.estimatedETAMinutes ?? undefined,
        attemptNumber: priorAssignedCount + 1,
      },
    });
  }

  /**
   * §17: find the best candidate at one radius step and assign them. Returns the assigned rider
   * id, or null if no eligible rider was found within that radius (caller — DispatchOrchestrator
   * for the multi-step case, or a direct caller for a single-radius search — decides what "still
   * searching" vs. "try a wider radius" means).
   */
  async dispatch(
    tx: Prisma.TransactionClient,
    deliveryId: string,
    originLat: number,
    originLng: number,
    excludeRiderIds: string[] = [],
    radiusKmOverride?: number,
  ): Promise<string | null> {
    const candidates = await this.findEligibleRiders(originLat, originLng, excludeRiderIds, radiusKmOverride);
    const best = candidates[0];
    if (!best) return null;
    await this.assign(tx, deliveryId, best.riderId, DeliveryAssignmentSource.AUTO, {
      estimatedDistanceKm: best.distanceKm,
      estimatedETAMinutes: best.etaMinutes,
    });
    return best.riderId;
  }
}
