export interface CandidateOrigin {
  latitude: number;
  longitude: number;
}

/** What every CandidateDiscoveryProvider hands back for one nearby rider — raw signal only, no
 * scoring/weighting decisions made here (that's EtaRankingService's job, one layer up). Includes
 * the rider's own current lat/lng (needed for the real ETA call downstream) and lastLocationAt
 * (needed for the GPS-staleness filter downstream) alongside the cheap PostGIS distance. */
export interface CandidateLocation {
  riderId: string;
  distanceKm: number;
  ratingAvg: number;
  latitude: number;
  longitude: number;
  lastLocationAt: Date | null;
}

/**
 * The swappable geo-candidate-search abstraction (mirrors `MapProvider`/`MAP_PROVIDER_TOKEN` in
 * ../../maps/providers/map-provider.interface.ts exactly). `PostgisCandidateProvider` is the only
 * implementation today — PostGIS `ST_DWithin`/`ST_Distance` on the already-indexed
 * `Rider.currentLocation` geography column, per the user's explicit "no H3 for now" decision. A
 * future `H3CandidateProvider` implements this same interface and swaps in via a one-line change
 * in DeliveryModule's provider registration — DispatchService/EtaRankingService never change.
 */
export abstract class CandidateDiscoveryProvider {
  abstract findCandidates(origin: CandidateOrigin, radiusKm: number, excludeRiderIds: string[]): Promise<CandidateLocation[]>;
}

export const CANDIDATE_DISCOVERY_TOKEN = 'CANDIDATE_DISCOVERY_TOKEN';
