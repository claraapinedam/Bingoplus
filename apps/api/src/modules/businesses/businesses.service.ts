import { BadRequestException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BusinessCapabilityType,
  BusinessMembershipStatus,
  BusinessStatus,
  BusinessUserRole,
  MembershipPlanStatus,
  ProductStatus,
  RoleName,
} from '@prisma/client';
import { resolvePagination } from '@bingoplus/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { ApplyBusinessDto } from './dto/apply-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { AddBusinessDocumentDto } from './dto/add-document.dto';
import { ListMarketplaceQueryDto } from './dto/list-marketplace-query.dto';
import { BusinessRankingService, RankableBusiness } from '../ranking/business-ranking.service';
import { BusinessCapabilitiesService } from '../business-capabilities/business-capabilities.service';
import { MembershipsService } from '../memberships/memberships.service';
import { getActiveOffersMap } from '../coupons/active-offers.util';
import { CouponsService } from '../coupons/coupons.service';

const DEFAULT_COMMISSION_SETTING_KEY = 'default_commission_rate';

/** Best-effort message extraction from a caught HttpException, regardless of whether it used the
 * plain-string form or the {error:{code,message}} structured form — apply()'s coupon redemption
 * step deliberately doesn't care which, it just needs something honest to hand back to the caller. */
function extractMessage(err: HttpException): string {
  const res = err.getResponse();
  if (typeof res === 'string') return res;
  if (typeof res === 'object' && res !== null) {
    const asAny = res as Record<string, unknown>;
    if (typeof asAny.error === 'object' && asAny.error !== null && 'message' in asAny.error) {
      return String((asAny.error as { message: unknown }).message);
    }
    if ('message' in asAny) {
      return Array.isArray(asAny.message) ? asAny.message.join(', ') : String(asAny.message);
    }
  }
  return err.message;
}

@Injectable()
export class BusinessesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ranking: BusinessRankingService,
    private readonly capabilities: BusinessCapabilitiesService,
    private readonly memberships: MembershipsService,
    private readonly coupons: CouponsService,
  ) {}

  listCategories() {
    return this.prisma.businessCategory.findMany({ orderBy: { name: 'asc' } });
  }

  // ── Marketplace (Tiendas) ────────────────────────────────────────────────
  //
  // The unit of navigation is the business, not a global product catalog (docs/01 §4 extended by
  // this feature): a customer discovers stores first, ranked by BusinessRankingService, then
  // enters one store's own catalog. Ranking always happens here in the backend — never
  // recomputed client-side.

  /**
   * Ranked "Tiendas" listing. `userId` (when the caller is authenticated) auto-derives the
   * species-relevance signal from that customer's own pets; `query.species` can narrow/override
   * it. Distance ranking only activates when the client supplies real coordinates — no location
   * is ever invented server-side.
   */
  async listMarketplace(query: ListMarketplaceQueryDto, userId?: string) {
    const category = query.category
      ? await this.prisma.businessCategory.findUnique({ where: { slug: query.category } })
      : null;
    const speciesFilter = query.species
      ? await this.prisma.petSpecies.findUnique({ where: { slug: query.species } })
      : null;
    const productCategoryFilter = query.productCategory
      ? await this.prisma.productCategory.findUnique({ where: { slug: query.productCategory } })
      : null;

    const businesses = await this.prisma.business.findMany({
      where: {
        status: BusinessStatus.ACTIVE,
        deletedAt: null,
        // RULE 4: Marketplace eligibility = active AND SELLS_PRODUCTS, never the category.
        capabilities: {
          some: { capability: BusinessCapabilityType.SELLS_PRODUCTS, enabled: true },
        },
        ...(category ? { categoryId: category.id } : {}),
        ...(query.search ? { tradeName: { contains: query.search, mode: 'insensitive' } } : {}),
        ...(speciesFilter
          ? {
              products: {
                some: {
                  status: ProductStatus.ACTIVE,
                  deletedAt: null,
                  species: { some: { speciesId: speciesFilter.id } },
                },
              },
            }
          : {}),
        ...(productCategoryFilter
          ? {
              products: {
                some: {
                  status: ProductStatus.ACTIVE,
                  deletedAt: null,
                  categoryId: productCategoryFilter.id,
                },
              },
            }
          : {}),
      },
      include: {
        category: true,
        products: {
          where: { status: ProductStatus.ACTIVE, deletedAt: null },
          select: { species: { select: { speciesId: true } } },
        },
      },
    });

    const userSpeciesIds = speciesFilter
      ? [speciesFilter.id]
      : userId
        ? await this.getUserPetSpeciesIds(userId)
        : [];

    const capabilityMaps = await this.capabilities.getMapForMany(businesses.map((b) => b.id));
    const offersMap = await getActiveOffersMap(this.prisma, businesses.map((b) => b.id));

    const rankable: RankableBusiness[] = businesses.map((b) => ({
      id: b.id,
      tradeName: b.tradeName,
      latitude: b.latitude,
      longitude: b.longitude,
      ratingAvg: b.ratingAvg,
      deliveryEnabled: capabilityMaps.get(b.id)![BusinessCapabilityType.DELIVERY],
      pickupEnabled: capabilityMaps.get(b.id)![BusinessCapabilityType.PICKUP],
      openingHours: b.openingHours,
      speciesIds: [...new Set(b.products.flatMap((p) => p.species.map((s) => s.speciesId)))],
    }));

    const ranked = await this.ranking.rankBusinesses(rankable, {
      userSpeciesIds,
      userLat: query.lat,
      userLng: query.lng,
    });

    const speciesNames = userSpeciesIds.length
      ? await this.prisma.petSpecies
          .findMany({ where: { id: { in: userSpeciesIds } } })
          .then((rows) => new Map(rows.map((r) => [r.id, r.name])))
      : new Map<string, string>();

    const byId = new Map(businesses.map((b) => [b.id, b]));

    return ranked.map((r) => {
      const b = byId.get(r.businessId)!;
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
        distanceKm: r.distanceKm,
        isOpenNow: r.isOpenNow,
        relevanceScore: r.relevanceScore,
        matchedSpecies: r.speciesMatch.matchedSpeciesIds.map((id) => speciesNames.get(id) ?? id),
        offer: offersMap.get(b.id)?.offer ?? null,
        moreOffersCount: offersMap.get(b.id)?.moreOffersCount ?? 0,
      };
    });
  }

  async getPublicBusiness(businessId: string) {
    const business = await this.prisma.business.findFirst({
      where: { id: businessId, status: BusinessStatus.ACTIVE, deletedAt: null },
      include: { category: true },
    });
    if (!business) throw new NotFoundException('Business not found');
    const capabilityMap = await this.capabilities.getMap(businessId);
    // "COUPON VISIBILITY RULE": computed once, server-side — the frontend must never derive
    // "Ver cupón" visibility itself from capabilities alone (COUPONS=true with zero active
    // coupons must NOT show the CTA).
    const couponSummary = await this.coupons.getCouponSummary(businessId);
    return { ...business, capabilities: capabilityMap, couponSummary };
  }

  private async getUserPetSpeciesIds(userId: string): Promise<string[]> {
    const pets = await this.prisma.pet.findMany({
      where: { ownerId: userId, deletedAt: null },
      select: { speciesId: true },
    });
    return [...new Set(pets.map((p) => p.speciesId))];
  }

  async apply(ownerId: string, dto: ApplyBusinessDto) {
    const category = await this.prisma.businessCategory.findUnique({
      where: { slug: dto.categorySlug },
    });
    if (!category) {
      throw new BadRequestException(`Unknown business category "${dto.categorySlug}"`);
    }

    // Directory presence is what's monetized via membership — independent of SELLS_PRODUCTS.
    // Selling products alone is monetized via marketplace commission (product sales + rider
    // delivery fee) and does NOT put a business in the Directory at all — it only shows up in
    // "Tiendas". Choosing the Directory, whether alone or together with selling products, always
    // requires an explicit, validated membership plan up front.
    let plan: { id: string; trialDays: number } | null = null;
    const directoryListing = dto.directoryListing === true;
    if (directoryListing) {
      if (!dto.membershipPlanId) {
        throw new BadRequestException({
          error: { code: 'MEMBERSHIP_PLAN_REQUIRED', message: 'Choose a membership plan to appear in the Directory.' },
        });
      }
      const found = await this.prisma.membershipPlan.findUnique({ where: { id: dto.membershipPlanId } });
      if (!found || found.status !== MembershipPlanStatus.ACTIVE) {
        throw new BadRequestException({
          error: { code: 'INVALID_MEMBERSHIP_PLAN', message: 'Unknown or inactive membership plan.' },
        });
      }
      plan = found;
    }

    const business = await this.prisma.business.create({
      data: {
        ownerId,
        categoryId: category.id,
        tradeName: dto.tradeName,
        legalName: dto.legalName,
        taxId: dto.taxId,
        email: dto.email,
        phone: dto.phone,
        description: dto.description,
        addressLine: dto.addressLine,
        city: dto.city,
        latitude: dto.latitude,
        longitude: dto.longitude,
        status: BusinessStatus.PENDING,
        businessUsers: { create: { userId: ownerId, role: BusinessUserRole.OWNER } },
      },
    });

    await this.capabilities.grantOnboardingDefaults(business.id, {
      sellsProducts: dto.sellsProducts,
      directoryListing,
      pickupEnabled: dto.pickupEnabled,
      deliveryEnabled: dto.deliveryEnabled,
    });
    await this.grantBusinessOwnerRole(ownerId);

    let couponError: string | undefined;
    if (plan) {
      await this.prisma.businessMembership.create({
        data: {
          businessId: business.id,
          planId: plan.id,
          status: BusinessMembershipStatus.TRIAL,
          trialEndsAt: new Date(Date.now() + plan.trialDays * 24 * 60 * 60 * 1000),
        },
      });
      // Best-effort: an invalid/expired code shouldn't cost the applicant their whole submission
      // ("si es que quiere" — it's an optional extra) — the business+membership still stand, the
      // response just says the code didn't apply and why, instead of a fabricated silent success.
      if (dto.couponCode) {
        try {
          await this.memberships.redeemAdminCoupon(business.id, dto.couponCode);
        } catch (err) {
          couponError = err instanceof HttpException ? extractMessage(err) : 'No se pudo aplicar el código de descuento.';
        }
      }
    }

    return { ...business, couponError };
  }

  /** Businesses this user has access to — via BusinessUser (OWNER or MANAGER), not just literal ownerId. */
  listOwn(userId: string) {
    return this.prisma.business.findMany({
      where: { businessUsers: { some: { userId } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOne(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      include: { category: true, documents: true },
    });
    if (!business) throw new NotFoundException('Business not found');
    const capabilities = await this.capabilities.getMap(businessId);
    return { ...business, capabilities };
  }

  update(businessId: string, dto: UpdateBusinessDto) {
    return this.prisma.business.update({ where: { id: businessId }, data: dto });
  }

  getCapabilities(businessId: string) {
    return this.capabilities.getMap(businessId);
  }

  /** ADMIN can toggle any capability, including Marketplace/Directory eligibility itself. */
  setCapabilityAsAdmin(businessId: string, capability: BusinessCapabilityType, enabled: boolean) {
    return this.capabilities.set(businessId, capability, enabled);
  }

  /**
   * The business owner/manager can only toggle their own *operational* capabilities — whether
   * they sell products at all (SELLS_PRODUCTS) or appear in the Directory (DIRECTORY_LISTING)
   * are platform-eligibility decisions reserved for Admin (mirrors the approve/reject/suspend
   * tier of control), not a business-side self-service toggle.
   */
  setOperationalCapability(businessId: string, capability: BusinessCapabilityType, enabled: boolean) {
    const OPERATIONAL: BusinessCapabilityType[] = [
      BusinessCapabilityType.SERVICES,
      BusinessCapabilityType.BOOKINGS,
      BusinessCapabilityType.COUPONS,
      BusinessCapabilityType.PICKUP,
      BusinessCapabilityType.DELIVERY,
    ];
    if (!OPERATIONAL.includes(capability)) {
      throw new BadRequestException(
        `"${capability}" can only be changed by an administrator, not the business itself`,
      );
    }
    return this.capabilities.set(businessId, capability, enabled);
  }

  addDocument(businessId: string, dto: AddBusinessDocumentDto) {
    return this.prisma.businessDocument.create({
      data: { businessId, type: dto.type, fileUrl: dto.fileUrl },
    });
  }

  // ── Admin-facing ──────────────────────────────────────────────────────────

  async listForAdmin(params: { status?: BusinessStatus; search?: string; page?: number; pageSize?: number }) {
    const { skip, take, page, pageSize } = resolvePagination(params);
    const where = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.search
        ? {
            OR: [
              { tradeName: { contains: params.search, mode: 'insensitive' as const } },
              { legalName: { contains: params.search, mode: 'insensitive' as const } },
              { taxId: { contains: params.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [total, businesses] = await this.prisma.$transaction([
      this.prisma.business.count({ where }),
      this.prisma.business.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { category: true },
      }),
    ]);

    const salesByBusiness = await this.countSalesByBusiness(businesses.map((b) => b.id));

    return {
      data: businesses.map((b) => ({
        ...b,
        salesCount: salesByBusiness.get(b.id)?.count ?? 0,
        salesTotal: salesByBusiness.get(b.id)?.total ?? 0,
      })),
      meta: { page, pageSize, total },
    };
  }

  /**
   * Real count/sum of completed Orders per business (0 for everyone until Phase 3's checkout
   * module starts creating orders — an honest empty state, never a placeholder number).
   */
  private async countSalesByBusiness(
    businessIds: string[],
  ): Promise<Map<string, { count: number; total: number }>> {
    if (businessIds.length === 0) return new Map();
    const grouped = await this.prisma.order.groupBy({
      by: ['businessId'],
      where: { businessId: { in: businessIds }, status: { not: 'CANCELLED' } },
      _count: { _all: true },
      _sum: { total: true },
    });
    return new Map(
      grouped.map((g) => [g.businessId, { count: g._count._all, total: Number(g._sum.total ?? 0) }]),
    );
  }

  /** Admin-facing (FASE 6 §26) — real GMV (from the same countSalesByBusiness every other admin
   * screen uses, never a separate/invented figure) times each business's current commission
   * rate. No Analytics engine, just an honest multiplication of two real numbers; a business with
   * no Commission row yet (never approved with one) shows a null rate/revenue rather than
   * guessing a default. */
  async listCommissionsForAdmin() {
    const businesses = await this.prisma.business.findMany({
      where: { deletedAt: null },
      select: { id: true, tradeName: true, status: true },
      orderBy: { tradeName: 'asc' },
    });
    const businessIds = businesses.map((b) => b.id);
    const [salesByBusiness, commissions] = await Promise.all([
      this.countSalesByBusiness(businessIds),
      this.prisma.commission.findMany({
        where: { businessId: { in: businessIds } },
        orderBy: { effectiveFrom: 'desc' },
      }),
    ]);
    const rateByBusiness = new Map<string, number>();
    for (const c of commissions) {
      if (!rateByBusiness.has(c.businessId)) rateByBusiness.set(c.businessId, Number(c.rate));
    }
    return businesses.map((b) => {
      const sales = salesByBusiness.get(b.id) ?? { count: 0, total: 0 };
      const rate = rateByBusiness.get(b.id) ?? null;
      return {
        businessId: b.id,
        tradeName: b.tradeName,
        status: b.status,
        salesCount: sales.count,
        gmv: sales.total,
        commissionRate: rate,
        estimatedRevenue: rate !== null ? Math.round(sales.total * rate * 100) / 100 : null,
      };
    });
  }

  async listCommissionHistory(businessId: string) {
    return this.prisma.commission.findMany({ where: { businessId }, orderBy: { effectiveFrom: 'desc' } });
  }

  /** Same real GMV × current-rate computation as listCommissionsForAdmin, scoped to one business
   * — used by the per-business admin hub so it never has to pull the whole-platform list just to
   * show one row. */
  async getCommissionSummary(businessId: string) {
    const business = await this.getOne(businessId);
    const [salesByBusiness, commission] = await Promise.all([
      this.countSalesByBusiness([businessId]),
      this.prisma.commission.findFirst({ where: { businessId }, orderBy: { effectiveFrom: 'desc' } }),
    ]);
    const sales = salesByBusiness.get(businessId) ?? { count: 0, total: 0 };
    const rate = commission ? Number(commission.rate) : null;
    return {
      businessId: business.id,
      tradeName: business.tradeName,
      status: business.status,
      salesCount: sales.count,
      gmv: sales.total,
      commissionRate: rate,
      estimatedRevenue: rate !== null ? Math.round(sales.total * rate * 100) / 100 : null,
    };
  }

  async approve(businessId: string, adminId: string, commissionRate?: number) {
    const business = await this.getOne(businessId);
    if (business.status === BusinessStatus.ACTIVE) {
      throw new BadRequestException('Business is already active');
    }

    const rate = commissionRate ?? (await this.getDefaultCommissionRate());

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.commission.create({
        data: { businessId, rate, createdBy: adminId },
      });
      return tx.business.update({
        where: { id: businessId },
        data: { status: BusinessStatus.APPROVED },
      });
    });

    // Directory presence needs a membership (docs §12) — but only when the business actually
    // chose DIRECTORY_LISTING at apply time (see apply()'s directory-listing membership rule). A
    // pure product-seller earns BINGO+ its revenue via marketplace commission and never gets a
    // membership row at all, whether newly-applying or being (re-)approved here.
    if (business.capabilities.DIRECTORY_LISTING) {
      await this.memberships.startTrialIfMissing(businessId);
    }

    return updated;
  }

  /** Businesses only appear in Explore/Home and can receive orders once ACTIVE (rule: docs/01 §4). */
  activate(businessId: string) {
    return this.prisma.business.update({
      where: { id: businessId },
      data: { status: BusinessStatus.ACTIVE },
    });
  }

  reject(businessId: string) {
    return this.prisma.business.update({
      where: { id: businessId },
      data: { status: BusinessStatus.REJECTED },
    });
  }

  suspend(businessId: string) {
    return this.prisma.business.update({
      where: { id: businessId },
      data: { status: BusinessStatus.SUSPENDED },
    });
  }

  private async getDefaultCommissionRate(): Promise<number> {
    const setting = await this.prisma.platformSetting.findUnique({
      where: { key: DEFAULT_COMMISSION_SETTING_KEY },
    });
    return typeof setting?.value === 'number' ? setting.value : 0.15;
  }

  private async grantBusinessOwnerRole(userId: string) {
    const role = await this.prisma.role.findUnique({ where: { name: RoleName.BUSINESS_OWNER } });
    if (!role) return;
    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      create: { userId, roleId: role.id },
      update: {},
    });
  }
}
