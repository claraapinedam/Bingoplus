import { Injectable } from '@nestjs/common';
import { getOpeningStatus, haversineKm } from '@bingoplus/utils';
import { PrismaService } from '../../prisma/prisma.service';

export interface RankingWeights {
  speciesMatch: number;
  distance: number;
  availability: number;
  rating: number;
  delivery: number;
}

/** Used whenever Admin hasn't set a MarketplaceRankingConfig row yet — never hardcoded into the score math itself. */
export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  speciesMatch: 0.45,
  distance: 0.25,
  availability: 0.1,
  rating: 0.1,
  delivery: 0.1,
};

/** Beyond this distance a business's distanceScore bottoms out at 0 rather than going negative. */
const MAX_RELEVANT_DISTANCE_KM = 15;

export interface RankableBusiness {
  id: string;
  tradeName: string;
  latitude: number | null;
  longitude: number | null;
  ratingAvg: number;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  openingHours: unknown;
  /** Distinct PetSpecies ids covered by this business's active, non-deleted products. */
  speciesIds: string[];
}

export interface RankingContext {
  userSpeciesIds: string[];
  userLat?: number;
  userLng?: number;
  now?: Date;
}

export interface SpeciesMatchResult {
  score: number;
  matchedSpeciesIds: string[];
  matchedCount: number;
}

export interface BusinessRelevance {
  businessId: string;
  relevanceScore: number;
  speciesMatch: SpeciesMatchResult;
  distanceKm: number | null;
  rating: number;
  isOpenNow: boolean | null;
  deliveryAvailable: boolean;
  pickupAvailable: boolean;
}

/**
 * Computes how relevant a business is to a customer, combining species-fit, distance,
 * open-now, rating and delivery/pickup availability into one relevanceScore. This is the
 * backend-only ranking logic behind the Marketplace's "Tiendas" listing — the frontend never
 * recomputes it and never sees the raw score (docs/... §20 Transparencia UX), only derived
 * badges like "Para tu perro".
 */
@Injectable()
export class BusinessRankingService {
  constructor(private readonly prisma: PrismaService) {}

  /** MarketplaceRankingConfig is append-only history (docs/schema comment) — the latest row wins. */
  async getWeights(): Promise<RankingWeights> {
    const config = await this.prisma.marketplaceRankingConfig.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    if (!config) return DEFAULT_RANKING_WEIGHTS;
    return {
      speciesMatch: config.speciesMatchWeight,
      distance: config.distanceWeight,
      availability: config.availabilityWeight,
      rating: config.ratingWeight,
      delivery: config.deliveryWeight,
    };
  }

  async setWeights(weights: RankingWeights, updatedBy?: string): Promise<RankingWeights> {
    await this.prisma.marketplaceRankingConfig.create({
      data: {
        speciesMatchWeight: weights.speciesMatch,
        distanceWeight: weights.distance,
        availabilityWeight: weights.availability,
        ratingWeight: weights.rating,
        deliveryWeight: weights.delivery,
        updatedBy,
      },
    });
    return weights;
  }

  /** Coverage: what fraction of the user's own pet species this business has relevant products for. */
  calculateSpeciesMatch(business: RankableBusiness, userSpeciesIds: string[]): SpeciesMatchResult {
    if (userSpeciesIds.length === 0) {
      return { score: 0, matchedSpeciesIds: [], matchedCount: 0 };
    }
    const matched = userSpeciesIds.filter((id) => business.speciesIds.includes(id));
    return {
      score: matched.length / userSpeciesIds.length,
      matchedSpeciesIds: matched,
      matchedCount: matched.length,
    };
  }

  /** Straight-line (haversine) distance from real, client-supplied coordinates — never a fabricated location. */
  calculateDistanceScore(
    business: RankableBusiness,
    userLat?: number,
    userLng?: number,
  ): { score: number; distanceKm: number | null } {
    if (
      userLat === undefined ||
      userLng === undefined ||
      business.latitude === null ||
      business.longitude === null
    ) {
      return { score: 0.5, distanceKm: null };
    }
    const distanceKm = haversineKm(
      { lat: userLat, lng: userLng },
      { lat: business.latitude, lng: business.longitude },
    );
    return { score: Math.max(0, 1 - distanceKm / MAX_RELEVANT_DISTANCE_KM), distanceKm };
  }

  calculateAvailabilityScore(
    business: RankableBusiness,
    now: Date = new Date(),
  ): { score: number; isOpenNow: boolean | null } {
    const { isOpenNow } = getOpeningStatus(business.openingHours, now);
    if (isOpenNow === null) return { score: 0.5, isOpenNow: null };
    return { score: isOpenNow ? 1 : 0, isOpenNow };
  }

  calculateRatingScore(business: RankableBusiness): number {
    return Math.max(0, Math.min(1, business.ratingAvg / 5));
  }

  calculateDeliveryScore(business: RankableBusiness): number {
    const flags = [business.deliveryEnabled, business.pickupEnabled];
    return flags.filter(Boolean).length / flags.length;
  }

  async calculateBusinessRelevance(
    business: RankableBusiness,
    context: RankingContext,
    weights?: RankingWeights,
  ): Promise<BusinessRelevance> {
    const w = weights ?? (await this.getWeights());
    const speciesMatch = this.calculateSpeciesMatch(business, context.userSpeciesIds);
    const distance = this.calculateDistanceScore(business, context.userLat, context.userLng);
    const availability = this.calculateAvailabilityScore(business, context.now);
    const ratingScore = this.calculateRatingScore(business);
    const deliveryScore = this.calculateDeliveryScore(business);

    const relevanceScore =
      speciesMatch.score * w.speciesMatch +
      distance.score * w.distance +
      availability.score * w.availability +
      ratingScore * w.rating +
      deliveryScore * w.delivery;

    return {
      businessId: business.id,
      relevanceScore,
      speciesMatch,
      distanceKm: distance.distanceKm,
      rating: business.ratingAvg,
      isOpenNow: availability.isOpenNow,
      deliveryAvailable: business.deliveryEnabled,
      pickupAvailable: business.pickupEnabled,
    };
  }

  /** Ranks a candidate set: relevanceScore descending, alphabetical (es locale) as the final tiebreaker. */
  async rankBusinesses(
    businesses: RankableBusiness[],
    context: RankingContext,
  ): Promise<BusinessRelevance[]> {
    const weights = await this.getWeights();
    const relevances = await Promise.all(
      businesses.map((b) => this.calculateBusinessRelevance(b, context, weights)),
    );
    const nameById = new Map(businesses.map((b) => [b.id, b.tradeName]));
    return relevances.sort((a, b) => {
      if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
      return nameById.get(a.businessId)!.localeCompare(nameById.get(b.businessId)!, 'es');
    });
  }
}
