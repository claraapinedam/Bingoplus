import { Injectable } from '@nestjs/common';
import { getOpeningStatus, haversineKm } from '@bingoplus/utils';
import { BusinessCapabilityType, BusinessMembershipStatus, BusinessStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ListDirectoryQueryDto } from './dto/list-directory-query.dto';
import { getActiveOffersMap } from '../coupons/active-offers.util';

/** "Tiendas" and "Delivery" (retired, kept here only for any business that already has it — see
 * seed-helpers.ts) are the two retail-type BusinessCategory slugs — same partition
 * BusinessApplyForm uses to decide which categories are offerable for each onboarding goal. A
 * business whose categories are ALL retail-type has nothing directory-worthy to show; it belongs
 * exclusively in Marketplace ("Tiendas" search). Since categories are multi-select, a business
 * that picked "Ambos" can legitimately have "tiendas" ALONGSIDE a real directory category (e.g.
 * "veterinarios") — it still shows here via that other category, only a retail-only business is
 * excluded. */
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
        categories: { some: { category: { slug: { notIn: NON_DIRECTORY_CATEGORY_SLUGS } } } },
        ...(category ? { categories: { some: { categoryId: category.id } } } : {}),
        ...(query.search ? { tradeName: { contains: query.search, mode: 'insensitive' } } : {}),
      },
      include: { categories: { include: { category: true } }, membership: { include: { plan: true } } },
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
        categories: b.categories.map((c) => ({ id: c.category.id, name: c.category.name, slug: c.category.slug, icon: c.category.icon })),
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
