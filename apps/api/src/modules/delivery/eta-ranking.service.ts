import { Injectable } from '@nestjs/common';
import { MapService } from '../maps/map.service';
import { CandidateLocation } from './candidate-discovery/candidate-discovery.interface';

export interface RankedCandidate {
  riderId: string;
  distanceKm: number;
  ratingAvg: number;
  /** null when the map provider couldn't produce an ETA for this candidate (outage/timeout) —
   * the candidate is still ranked (distance-only fallback), never dropped. */
  etaMinutes: number | null;
  score: number;
}

export interface EtaRankingWeights {
  etaWeight: number;
  distanceWeight: number;
  ratingWeight: number;
  /** The radius step actually searched — used to normalize distanceScore the same way the old
   * single-radius scoring did (score degrades to 0 at the edge of the searched radius). */
  radiusKm: number;
}

/**
 * §38-39 (spec) / plan item 3: takes the PostGIS-filtered, staleness-filtered candidate list, caps
 * it at `maxCandidatesForEta` (only the survivors of the cheap distance pre-filter get the
 * expensive real-ETA call — the "6 of 20" behavior), then calls `MapService.calculateETASafe` for
 * each **in parallel**. ETA is the primary ranking signal (etaWeight defaults highest), distance
 * and rating fill in the rest. If a candidate's ETA call fails, that candidate falls back to
 * distance+rating-only scoring rather than being excluded — a Maps outage must never stall dispatch.
 */
@Injectable()
export class EtaRankingService {
  constructor(private readonly maps: MapService) {}

  async rank(
    candidates: CandidateLocation[],
    pickup: { latitude: number; longitude: number },
    weights: EtaRankingWeights,
    maxCandidatesForEta: number,
  ): Promise<RankedCandidate[]> {
    if (candidates.length === 0) return [];

    // Cheap pre-sort by straight-line distance so the expensive ETA call only ever goes out to the
    // most plausible survivors, not every candidate PostGIS returned.
    const survivors = [...candidates].sort((a, b) => a.distanceKm - b.distanceKm).slice(0, Math.max(1, maxCandidatesForEta));

    const withEta = await Promise.all(
      survivors.map(async (candidate) => ({
        candidate,
        eta: await this.maps.calculateETASafe({ latitude: candidate.latitude, longitude: candidate.longitude }, pickup),
      })),
    );

    const resolvedEtaMinutes = withEta.map(({ eta }) => eta?.etaMinutes).filter((v): v is number => v != null);
    // Normalizes etaScore relative to the worst ETA actually seen this round, same shape as the
    // existing distanceScore-relative-to-maxSearchRadiusKm normalization below.
    const maxEtaMinutes = resolvedEtaMinutes.length > 0 ? Math.max(...resolvedEtaMinutes) : 0;

    const ranked = withEta.map(({ candidate, eta }) => {
      const distanceScore = Math.max(0, 1 - candidate.distanceKm / weights.radiusKm);
      const ratingScore = candidate.ratingAvg / 5;

      if (eta) {
        const etaScore = maxEtaMinutes > 0 ? Math.max(0, 1 - eta.etaMinutes / maxEtaMinutes) : 1;
        const score = weights.etaWeight * etaScore + weights.distanceWeight * distanceScore + weights.ratingWeight * ratingScore;
        return { riderId: candidate.riderId, distanceKm: candidate.distanceKm, ratingAvg: candidate.ratingAvg, etaMinutes: eta.etaMinutes, score };
      }

      // Maps outage/failure fallback — never exclude the candidate, just drop the ETA term and
      // renormalize over the remaining (distance+rating) weights so the score stays comparable.
      const fallbackWeightTotal = weights.distanceWeight + weights.ratingWeight || 1;
      const score = (weights.distanceWeight * distanceScore + weights.ratingWeight * ratingScore) / fallbackWeightTotal;
      return { riderId: candidate.riderId, distanceKm: candidate.distanceKm, ratingAvg: candidate.ratingAvg, etaMinutes: null, score };
    });

    return ranked.sort((a, b) => b.score - a.score);
  }
}
