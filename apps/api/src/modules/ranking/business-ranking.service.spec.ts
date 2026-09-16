import { BusinessRankingService, RankableBusiness } from './business-ranking.service';
import { PrismaService } from '../../prisma/prisma.service';

const DOG = 'dog-id';
const CAT = 'cat-id';
const BIRD = 'bird-id';

function business(overrides: Partial<RankableBusiness> & { id: string; tradeName: string }): RankableBusiness {
  return {
    latitude: null,
    longitude: null,
    ratingAvg: 4,
    deliveryEnabled: true,
    pickupEnabled: true,
    openingHours: null,
    speciesIds: [],
    ...overrides,
  };
}

describe('BusinessRankingService', () => {
  let service: BusinessRankingService;
  let prisma: any;

  beforeEach(() => {
    prisma = { marketplaceRankingConfig: { findFirst: jest.fn().mockResolvedValue(null) } };
    service = new BusinessRankingService(prisma as unknown as PrismaService);
  });

  describe('calculateSpeciesMatch', () => {
    it('scores 0 when the user has no pets on file', () => {
      const result = service.calculateSpeciesMatch(business({ id: 'b1', tradeName: 'A', speciesIds: [DOG] }), []);
      expect(result.score).toBe(0);
    });

    it('rewards a business covering more of the user\'s species higher', () => {
      const partial = service.calculateSpeciesMatch(
        business({ id: 'b1', tradeName: 'Bingo Pet Shop', speciesIds: [DOG] }),
        [DOG, BIRD],
      );
      const full = service.calculateSpeciesMatch(
        business({ id: 'b2', tradeName: 'Pet World', speciesIds: [DOG, BIRD, CAT] }),
        [DOG, BIRD],
      );
      expect(partial.score).toBeCloseTo(0.5);
      expect(full.score).toBeCloseTo(1);
      expect(full.score).toBeGreaterThan(partial.score);
    });
  });

  describe('calculateDistanceScore', () => {
    it('is neutral (0.5) when either coordinate is missing — never a fabricated location', () => {
      const b = business({ id: 'b1', tradeName: 'A', latitude: null, longitude: null });
      expect(service.calculateDistanceScore(b).score).toBe(0.5);
      expect(service.calculateDistanceScore(b).distanceKm).toBeNull();
    });

    it('scores closer businesses higher than farther ones', () => {
      const near = business({ id: 'b1', tradeName: 'Near', latitude: -0.18, longitude: -78.47 });
      const far = business({ id: 'b2', tradeName: 'Far', latitude: -0.5, longitude: -79.0 });
      const nearScore = service.calculateDistanceScore(near, -0.1807, -78.4678).score;
      const farScore = service.calculateDistanceScore(far, -0.1807, -78.4678).score;
      expect(nearScore).toBeGreaterThan(farScore);
    });
  });

  describe('calculateAvailabilityScore', () => {
    it('is unknown (null) when no opening hours are configured', () => {
      const result = service.calculateAvailabilityScore(business({ id: 'b1', tradeName: 'A', openingHours: null }));
      expect(result.isOpenNow).toBeNull();
      expect(result.score).toBe(0.5);
    });

    it('detects open vs closed from opening hours for the current day', () => {
      const hours = { mon: { open: '00:00', close: '23:59' } };
      const monday = new Date('2026-09-14T12:00:00'); // a Monday
      const open = service.calculateAvailabilityScore(
        business({ id: 'b1', tradeName: 'A', openingHours: hours }),
        monday,
      );
      expect(open.isOpenNow).toBe(true);
      expect(open.score).toBe(1);

      const closedHours = { tue: { open: '09:00', close: '18:00' } };
      const closed = service.calculateAvailabilityScore(
        business({ id: 'b1', tradeName: 'A', openingHours: closedHours }),
        monday,
      );
      expect(closed.isOpenNow).toBe(false);
      expect(closed.score).toBe(0);
    });
  });

  describe('calculateDeliveryScore', () => {
    it('scores both delivery and pickup higher than just one', () => {
      const both = service.calculateDeliveryScore(
        business({ id: 'b1', tradeName: 'A', deliveryEnabled: true, pickupEnabled: true }),
      );
      const one = service.calculateDeliveryScore(
        business({ id: 'b2', tradeName: 'B', deliveryEnabled: false, pickupEnabled: true }),
      );
      expect(both).toBe(1);
      expect(one).toBe(0.5);
    });
  });

  describe('rankBusinesses — the documented example scenario', () => {
    it('orders by species relevance first, alphabetically within the same relevance level', async () => {
      // User has a dog and a bird, per the spec's worked example.
      const userSpeciesIds = [DOG, BIRD];
      const businesses = [
        business({ id: 'aves', tradeName: 'Aves & Más', speciesIds: [BIRD] }),
        business({ id: 'animal-house', tradeName: 'Animal House', speciesIds: [DOG, CAT] }),
        business({ id: 'pet-world', tradeName: 'Pet World', speciesIds: [DOG, CAT, BIRD] }),
        business({ id: 'bingo', tradeName: 'Bingo Pet Shop', speciesIds: [DOG] }),
        business({ id: 'zoo', tradeName: 'Zoo Market', speciesIds: [CAT] }),
      ];

      const ranked = await service.rankBusinesses(businesses, { userSpeciesIds });
      const order = ranked.map((r) => r.businessId);

      // Pet World covers both species — must be first.
      expect(order[0]).toBe('pet-world');
      // Zoo Market matches neither — must be last.
      expect(order[order.length - 1]).toBe('zoo');
      // Among the single-species matches (Animal House, Aves & Más, Bingo Pet Shop), whichever
      // are tied on score fall back to alphabetical order.
      const singleMatchOrder = order.filter((id) => id !== 'pet-world' && id !== 'zoo');
      const names = singleMatchOrder.map(
        (id) => businesses.find((b) => b.id === id)!.tradeName,
      );
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'es')));
    });
  });

  describe('getWeights', () => {
    it('falls back to the documented defaults when no PlatformSetting override exists', async () => {
      const weights = await service.getWeights();
      expect(weights.speciesMatch).toBe(0.45);
      expect(weights.speciesMatch + weights.distance + weights.availability + weights.rating + weights.delivery).toBeCloseTo(1);
    });
  });
});
