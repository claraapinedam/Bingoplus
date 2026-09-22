import { DeliveryAssignmentAction, DeliveryAssignmentSource, DeliveryStatus } from '@prisma/client';
import { DispatchService } from './dispatch.service';
import { DeliveryStateMachine } from './delivery-state-machine';

const now = Date.now();

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    riderId: 'r1',
    distanceKm: 2,
    ratingAvg: 4,
    latitude: -0.21,
    longitude: -78.51,
    lastLocationAt: new Date(now),
    ...overrides,
  };
}

describe('DispatchService', () => {
  let service: DispatchService;
  let prisma: any;
  let candidateProvider: any;
  let etaRanking: any;

  beforeEach(() => {
    prisma = {
      riderDispatchConfig: { findFirst: jest.fn().mockResolvedValue(null) }, // no row -> schema defaults
    };
    candidateProvider = { findCandidates: jest.fn().mockResolvedValue([]) };
    etaRanking = { rank: jest.fn().mockResolvedValue([]) };
    service = new DispatchService(prisma, new DeliveryStateMachine(), candidateProvider, etaRanking);
  });

  describe('getConfig', () => {
    it('falls back to schema defaults (including the new Dispatch V2 fields) when no RiderDispatchConfig row exists', async () => {
      const config = await service.getConfig();
      expect(config.etaWeight).toBe(0.6);
      expect(config.maxCandidatesForEta).toBe(8);
      expect(config.locationStaleThresholdSeconds).toBe(120);
      expect(config.radiusExpansionKm).toEqual([2, 4, 6, 8]);
      expect(config.retryBackoffSeconds).toBe(15);
      expect(config.maxDispatchAttempts).toBe(20);
    });
  });

  describe('findEligibleRiders — GPS staleness filter (plan item 2)', () => {
    it('rejects a candidate whose lastLocationAt is older than locationStaleThresholdSeconds even if otherwise eligible', async () => {
      prisma.riderDispatchConfig.findFirst.mockResolvedValue({
        distanceWeight: 0.5,
        ratingWeight: 0.3,
        availabilityWeight: 0.2,
        maxSearchRadiusKm: 10,
        assignmentTimeoutSeconds: 60,
        etaWeight: 0.6,
        maxCandidatesForEta: 8,
        locationStaleThresholdSeconds: 60,
        radiusExpansionKm: [2, 4, 6, 8],
        retryBackoffSeconds: 15,
        maxDispatchAttempts: 20,
      });
      const stale = candidate({ riderId: 'stale-rider', lastLocationAt: new Date(now - 5 * 60 * 1000) });
      const fresh = candidate({ riderId: 'fresh-rider', lastLocationAt: new Date(now) });
      candidateProvider.findCandidates.mockResolvedValue([stale, fresh]);

      await service.findEligibleRiders(-0.2, -78.5);

      expect(etaRanking.rank).toHaveBeenCalledWith(
        [fresh],
        { latitude: -0.2, longitude: -78.5 },
        expect.any(Object),
        8,
      );
    });

    it('returns an empty list (never calls the ranker) when every candidate is stale', async () => {
      candidateProvider.findCandidates.mockResolvedValue([candidate({ lastLocationAt: new Date(now - 999_000) })]);

      const result = await service.findEligibleRiders(-0.2, -78.5);

      expect(result).toEqual([]);
      expect(etaRanking.rank).not.toHaveBeenCalled();
    });

    it('rejects a candidate with no lastLocationAt at all (never treated as fresh)', async () => {
      candidateProvider.findCandidates.mockResolvedValue([candidate({ lastLocationAt: null })]);

      const result = await service.findEligibleRiders(-0.2, -78.5);

      expect(result).toEqual([]);
    });
  });

  describe('assign', () => {
    it('writes attemptNumber as (prior ASSIGNED history rows for this delivery) + 1', async () => {
      const tx = {
        delivery: { findUniqueOrThrow: jest.fn().mockResolvedValue({ status: DeliveryStatus.SEARCHING_RIDER }), update: jest.fn() },
        deliveryAssignmentHistory: { count: jest.fn().mockResolvedValue(2), create: jest.fn() },
      } as any;

      await service.assign(tx, 'd1', 'rider-1', DeliveryAssignmentSource.AUTO, { estimatedDistanceKm: 3.4, estimatedETAMinutes: 9 });

      expect(tx.deliveryAssignmentHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          deliveryId: 'd1',
          riderId: 'rider-1',
          action: DeliveryAssignmentAction.ASSIGNED,
          attemptNumber: 3,
          estimatedETAMinutes: 9,
        }),
      });
    });
  });

  describe('dispatch', () => {
    it('returns null and never calls assign when findEligibleRiders yields no candidates', async () => {
      candidateProvider.findCandidates.mockResolvedValue([]);
      const tx = { delivery: { findUniqueOrThrow: jest.fn(), update: jest.fn() }, deliveryAssignmentHistory: { count: jest.fn(), create: jest.fn() } } as any;

      const result = await service.dispatch(tx, 'd1', -0.2, -78.5);

      expect(result).toBeNull();
      expect(tx.delivery.update).not.toHaveBeenCalled();
    });
  });
});
