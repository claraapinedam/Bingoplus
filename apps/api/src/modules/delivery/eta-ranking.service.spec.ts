import { EtaRankingService } from './eta-ranking.service';
import { MapService } from '../maps/map.service';
import { CandidateLocation } from './candidate-discovery/candidate-discovery.interface';

const pickup = { latitude: -0.2, longitude: -78.5 };

function candidate(overrides: Partial<CandidateLocation> = {}): CandidateLocation {
  return {
    riderId: 'r1',
    distanceKm: 2,
    ratingAvg: 4,
    latitude: -0.21,
    longitude: -78.51,
    lastLocationAt: new Date(),
    ...overrides,
  };
}

describe('EtaRankingService', () => {
  let service: EtaRankingService;
  let maps: any;

  beforeEach(() => {
    maps = { calculateETASafe: jest.fn() };
    service = new EtaRankingService(maps as unknown as MapService);
  });

  it('returns an empty list without calling the map provider when there are no candidates', async () => {
    const result = await service.rank([], pickup, { etaWeight: 0.6, distanceWeight: 0.3, ratingWeight: 0.1, radiusKm: 10 }, 8);
    expect(result).toEqual([]);
    expect(maps.calculateETASafe).not.toHaveBeenCalled();
  });

  it('ranks the candidate with the lower ETA first when ETA is the dominant weight, even if it is farther away', async () => {
    const near = candidate({ riderId: 'near-but-slow', distanceKm: 1, ratingAvg: 4, latitude: -0.21 });
    const far = candidate({ riderId: 'far-but-fast', distanceKm: 5, ratingAvg: 4, latitude: -0.29 });
    maps.calculateETASafe.mockImplementation((origin: { latitude: number }) => {
      // near-but-slow reports a long ETA (e.g. stuck behind a river/highway), far-but-fast a short one.
      if (origin.latitude === near.latitude) return Promise.resolve({ etaMinutes: 20, distanceKm: 1 });
      return Promise.resolve({ etaMinutes: 4, distanceKm: 5 });
    });

    const result = await service.rank([near, far], pickup, { etaWeight: 0.8, distanceWeight: 0.1, ratingWeight: 0.1, radiusKm: 10 }, 8);

    expect(result[0].riderId).toBe('far-but-fast');
    expect(result[0].etaMinutes).toBe(4);
  });

  it('falls back to distance+rating-only scoring (never excludes the candidate) when the map provider fails to produce an ETA', async () => {
    const c = candidate({ riderId: 'r-outage' });
    maps.calculateETASafe.mockResolvedValue(null);

    const result = await service.rank([c], pickup, { etaWeight: 0.6, distanceWeight: 0.3, ratingWeight: 0.1, radiusKm: 10 }, 8);

    expect(result).toHaveLength(1);
    expect(result[0].riderId).toBe('r-outage');
    expect(result[0].etaMinutes).toBeNull();
    expect(result[0].score).toBeGreaterThan(0);
  });

  it('only calls the map provider for the closest maxCandidatesForEta survivors, not the whole candidate set', async () => {
    const candidates = Array.from({ length: 20 }, (_, i) => candidate({ riderId: `r${i}`, distanceKm: i + 1 }));
    maps.calculateETASafe.mockResolvedValue({ etaMinutes: 5, distanceKm: 1 });

    await service.rank(candidates, pickup, { etaWeight: 0.6, distanceWeight: 0.3, ratingWeight: 0.1, radiusKm: 25 }, 6);

    expect(maps.calculateETASafe).toHaveBeenCalledTimes(6);
  });

  it('sorts the final result by score descending', async () => {
    const better = candidate({ riderId: 'better', distanceKm: 1, ratingAvg: 5, latitude: -0.21 });
    const worse = candidate({ riderId: 'worse', distanceKm: 8, ratingAvg: 2, latitude: -0.29 });
    maps.calculateETASafe.mockImplementation((origin: { latitude: number }) =>
      Promise.resolve({ etaMinutes: origin.latitude === better.latitude ? 3 : 15, distanceKm: 1 }),
    );

    const result = await service.rank([worse, better], pickup, { etaWeight: 0.6, distanceWeight: 0.3, ratingWeight: 0.1, radiusKm: 10 }, 8);

    expect(result.map((r) => r.riderId)).toEqual(['better', 'worse']);
    expect(result[0].score).toBeGreaterThan(result[1].score);
  });
});
