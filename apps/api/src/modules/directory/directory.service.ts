import { Injectable } from '@nestjs/common';
import { getOpeningStatus, haversineKm } from '@bingoplus/utils';
import { BusinessCapabilityType, BusinessMembershipStatus, BusinessStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ListDirectoryQueryDto } from './dto/list-directory-query.dto';
import { getActiveOffersMap } from '../coupons/active-offers.util';

/** "Tiendas" and "Delivery" are the two retail-type BusinessCategory slugs — the same partition
 * BusinessApplyForm uses to decide which categories are even offerable for each onboarding goal.
 * A business in one of these categories has nothing directory-worthy to show; it belongs
 * exclusively in Marketplace ("Tiendas" search), never here — even if it also opted into
 * DIRECTORY_LISTING with a paid plan (e.g. a "Tiendas"-category business that picked "Ambos"). */
const NON_DIRECTORY_CATEGORY_SLUGS = ['tiendas', 'delivery'];
const GOOD_STANDING: BusinessMembershipStatus[] = [BusinessMembershipStatus.TRIAL, BusinessMembershipStatus.ACTIVE];

/**
 * The Directory is a deliberately separate discovery surface from the Marketplace (RULE 5): a
 * business is visible here based on DIRECTORY_LISTING + an in-good-standing membership, not
 * SELLS_PRODUCTS, and listing order is "featured" plan tier first, then distance/rating — it does
 * not run pet-species ranking (BusinessRankingService), since a Directory-only business (e.g. a
 * boarding hotel) may carry no products/species signal at all.
 */
@Injectable()
export class DirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListDirectoryQueryDto) {
    const category = query.category
      ? await this.prisma.businessCategory.findUnique({ where: { slug: query.category } })
      : null;

    const businesses = await this.prisma.business.findMany({
      where: {
        status: BusinessStatus.ACTIVE,
        deletedAt: null,
        capabilities: {
          some: { capability: BusinessCapabilityType.DIRECTORY_LISTING, enabled: true },
        },
        membership: {
          status: { in: GOOD_STANDING },
        },
        category: { slug: { notIn: NON_DIRECTORY_CATEGORY_SLUGS } },
        ...(category ? { categoryId: category.id } : {}),
        ...(query.search ? { tradeName: { contains: query.search, mode: 'insensitive' } } : {}),
      },
      include: { category: true, membership: { include: { plan: true } } },
    });

    const offersMap = await getActiveOffersMap(this.prisma, businesses.map((b) => b.id));

    const withDistance = businesses.map((b) => {
      const distanceKm =
        query.lat !== undefined && query.lng !== undefined && b.latitude !== null && b.longitude !== null
          ? haversineKm({ lat: query.lat, lng: query.lng }, { lat: b.latitude, lng: b.longitude })
          : null;
      const { isOpenNow, closesAt } = getOpeningStatus(b.openingHours);
      const benefits = b.membership?.plan.benefits as Record<string, unknown> | null;
      return {
        id: b.id,
        tradeName: b.tradeName,
        logoUrl: b.logoUrl,
        coverImageUrl: b.coverImageUrl,
        city: b.city,
        category: { id: b.category.id, name: b.category.name, slug: b.category.slug, icon: b.category.icon },
        ratingAvg: b.ratingAvg,
        reviewCount: b.reviewCount,
        distanceKm,
        isOpenNow,
        closesAt,
        offer: offersMap.get(b.id)?.offer ?? null,
        moreOffersCount: offersMap.get(b.id)?.moreOffersCount ?? 0,
        featured: benefits?.featured === true,
      };
    });

    // "Destacado en búsquedas" (Plan Pro) — a real ranking boost, not just label text: featured
    // businesses sort first, then the existing distance/rating order within each group.
    withDistance.sort((a, b) => {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      if (a.distanceKm !== null && b.distanceKm !== null) return a.distanceKm - b.distanceKm;
      return b.ratingAvg - a.ratingAvg;
    });

    return withDistance;
  }
}
