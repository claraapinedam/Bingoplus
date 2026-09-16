import { Injectable } from '@nestjs/common';
import { BusinessCapabilityType, BusinessStatus, FavoriteTargetType } from '@prisma/client';
import { getOpeningStatus } from '@bingoplus/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessCapabilitiesService } from '../business-capabilities/business-capabilities.service';
import { getActiveOffersMap } from '../coupons/active-offers.util';

@Injectable()
export class FavoritesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capabilities: BusinessCapabilitiesService,
  ) {}

  list(userId: string, targetType?: FavoriteTargetType) {
    return this.prisma.favorite.findMany({
      where: { userId, ...(targetType ? { targetType } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Toggles a favorite on/off — the only mutation this resource needs, no separate add/remove routes. */
  async toggle(userId: string, targetType: FavoriteTargetType, targetId: string) {
    const existing = await this.prisma.favorite.findUnique({
      where: { userId_targetType_targetId: { userId, targetType, targetId } },
    });
    if (existing) {
      await this.prisma.favorite.delete({ where: { id: existing.id } });
      return { favorited: false };
    }
    await this.prisma.favorite.create({ data: { userId, targetType, targetId } });
    return { favorited: true };
  }

  /**
   * Hydrated "tiendas favoritas" for Home — a business favorited in the past that has since been
   * suspended/deleted silently drops out here (never shown as a broken card), matching every
   * other public business listing's ACTIVE-only rule.
   */
  async listFavoriteBusinesses(userId: string) {
    const favorites = await this.prisma.favorite.findMany({
      where: { userId, targetType: FavoriteTargetType.BUSINESS },
      orderBy: { createdAt: 'desc' },
    });
    if (favorites.length === 0) return [];

    const businesses = await this.prisma.business.findMany({
      where: { id: { in: favorites.map((f) => f.targetId) }, status: BusinessStatus.ACTIVE, deletedAt: null },
      include: { category: true },
    });
    const capabilityMaps = await this.capabilities.getMapForMany(businesses.map((b) => b.id));
    const offersMap = await getActiveOffersMap(this.prisma, businesses.map((b) => b.id));
    const orderById = new Map(favorites.map((f, i) => [f.targetId, i]));

    return businesses
      .sort((a, b) => orderById.get(a.id)! - orderById.get(b.id)!)
      .map((b) => {
        const { isOpenNow } = getOpeningStatus(b.openingHours);
        return {
          id: b.id,
          tradeName: b.tradeName,
          logoUrl: b.logoUrl,
          coverImageUrl: b.coverImageUrl,
          description: b.description,
          city: b.city,
          category: { id: b.category.id, name: b.category.name, slug: b.category.slug },
          ratingAvg: b.ratingAvg,
          reviewCount: b.reviewCount,
          deliveryEnabled: capabilityMaps.get(b.id)![BusinessCapabilityType.DELIVERY],
          pickupEnabled: capabilityMaps.get(b.id)![BusinessCapabilityType.PICKUP],
          deliveryFeeUsd: b.deliveryFeeUsd,
          deliveryEstimateMinutes: b.deliveryEstimateMinutes,
          distanceKm: null as number | null,
          isOpenNow,
          matchedSpecies: [] as string[],
          offer: offersMap.get(b.id)?.offer ?? null,
          moreOffersCount: offersMap.get(b.id)?.moreOffersCount ?? 0,
        };
      });
  }
}
