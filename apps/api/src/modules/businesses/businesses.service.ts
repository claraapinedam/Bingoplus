import { BadRequestException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BusinessCapabilityType,
  BusinessMembershipStatus,
  BusinessStatus,
  BusinessUserRole,
  MembershipPlanStatus,
  ProductStatus,
  RoleName,
  ServiceLocationType,
} from '@prisma/client';
import { resolvePagination } from '@bingoplus/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { ApplyBusinessDto } from './dto/apply-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { AddBusinessDocumentDto } from './dto/add-document.dto';
import { ListMarketplaceQueryDto } from './dto/list-marketplace-query.dto';
import { BusinessRankingService, RankableBusiness } from '../ranking/business-ranking.service';
import {
  BusinessCapabilitiesService,
  CapabilityMap,
  DIRECTORY_DEPENDENT_CAPABILITIES,
  PRODUCTS_DEPENDENT_CAPABILITIES,
} from '../business-capabilities/business-capabilities.service';
import { MembershipsService } from '../memberships/memberships.service';
import { getActiveOffersMap } from '../coupons/active-offers.util';
import { CouponsService } from '../coupons/coupons.service';
import { ContractsService } from '../contracts/contracts.service';

const DEFAULT_COMMISSION_SETTING_KEY = 'default_commission_rate';

// The one retail category — see resolveCategoryIds. "delivery" used to be a second retail
// category alongside this one; retired (never offerable to a new application again, though
// existing businesses that already have it keep it, see seed-helpers.ts's seedCategories comment).
const PRODUCT_CATEGORY_SLUG = 'tiendas';
const RETIRED_CATEGORY_SLUGS = ['delivery'];

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
    private readonly contracts: ContractsService,
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
        ...(category ? { categories: { some: { categoryId: category.id } } } : {}),
        ...(query.search ? { tradeName: { contains: query.search, mode: 'insensitive' } } : {}),
        ...(speciesFilter
          ? {
              OR: [
                { species: { some: { speciesId: speciesFilter.id } } },
                {
                  products: {
                    some: {
                      status: ProductStatus.ACTIVE,
                      deletedAt: null,
                      species: { some: { speciesId: speciesFilter.id } },
                    },
                  },
                },
              ],
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
        categories: { include: { category: true } },
        species: { select: { speciesId: true } },
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
      // Union of what the business declared at onboarding and what its active products are
      // actually tagged with — either signal alone can be incomplete (a business may have
      // declared species before listing any matching product, or vice versa for older records).
      speciesIds: [
        ...new Set([
          ...b.species.map((s) => s.speciesId),
          ...b.products.flatMap((p) => p.species.map((s) => s.speciesId)),
        ]),
      ],
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
        categories: b.categories.map((c) => ({ id: c.category.id, name: c.category.name, slug: c.category.slug })),
        ratingAvg: b.ratingAvg,
        reviewCount: b.reviewCount,
        deliveryEnabled: capabilityMaps.get(b.id)![BusinessCapabilityType.DELIVERY],
        pickupEnabled: capabilityMaps.get(b.id)![BusinessCapabilityType.PICKUP],
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
      include: { categories: { include: { category: true } } },
    });
    if (!business) throw new NotFoundException('Business not found');
    const { categories, ...rest } = business;
    const capabilityMap = await this.capabilities.getMap(businessId);
    // "COUPON VISIBILITY RULE": computed once, server-side — the frontend must never derive
    // "Ver cupón" visibility itself from capabilities alone (COUPONS=true with zero active
    // coupons must NOT show the CTA).
    const couponSummary = await this.coupons.getCouponSummary(businessId);
    const hasPhysicalLocation = await this.resolveHasPhysicalLocation(businessId, capabilityMap);
    return {
      ...rest,
      categories: categories.map((c) => c.category),
      capabilities: capabilityMap,
      couponSummary,
      hasPhysicalLocation,
    };
  }

  /**
   * Whether there's an actual premises worth showing "Cómo llegar" for. A business that sells
   * products or offers in-store pickup always has one. A Directory-only business only loses it if
   * HOME_SERVICE is enabled AND every one of its active services is AT_CUSTOMER_HOME-only — i.e. it
   * exclusively travels to the customer and has no place of its own to visit.
   */
  private async resolveHasPhysicalLocation(businessId: string, capabilities: CapabilityMap): Promise<boolean> {
    if (capabilities.SELLS_PRODUCTS || capabilities.PICKUP || !capabilities.HOME_SERVICE) return true;
    const onPremisesService = await this.prisma.service.findFirst({
      where: { businessId, active: true, deletedAt: null, locationType: { not: ServiceLocationType.AT_CUSTOMER_HOME } },
      select: { id: true },
    });
    return onPremisesService !== null;
  }

  /** Resolves PetSpecies slugs to ids, rejecting anything unknown — mirrors CatalogService's own
   * resolveSpeciesIds, but required here since a business without any declared species would be
   * unrecommendable by pet type from day one (see BusinessSpecies comment in schema.prisma). */
  private async resolveSpeciesIds(slugs: string[]): Promise<string[]> {
    const species = await this.prisma.petSpecies.findMany({ where: { slug: { in: slugs } } });
    const unknown = slugs.filter((slug) => !species.some((s) => s.slug === slug));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown pet species: ${unknown.join(', ')}`);
    }
    return species.map((s) => s.id);
  }

  /** Resolves BusinessCategory slugs to ids and enforces which ones are actually offerable for the
   * chosen goal — mirrors BusinessApplyForm's own categoriesForGoal restriction, never trusted from
   * the client alone. "tiendas" is the one retail category (see PRODUCT_CATEGORY_SLUGS comment on
   * the frontend for why "delivery" was retired): required whenever selling products, and the ONLY
   * category allowed for a products-only business (Directory-only categories don't apply to it); a
   * Directory-only business must pick at least one non-"tiendas" category instead. */
  private async resolveCategoryIds(slugs: string[], sellsProducts: boolean, directoryListing: boolean): Promise<string[]> {
    const categories = await this.prisma.businessCategory.findMany({ where: { slug: { in: slugs } } });
    const unknown = slugs.filter((slug) => !categories.some((c) => c.slug === slug));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown business category: ${unknown.join(', ')}`);
    }
    const retired = slugs.filter((slug) => RETIRED_CATEGORY_SLUGS.includes(slug));
    if (retired.length > 0) {
      throw new BadRequestException(`No longer offered for new applications: ${retired.join(', ')}`);
    }

    if (sellsProducts) {
      if (!slugs.includes(PRODUCT_CATEGORY_SLUG)) {
        throw new BadRequestException('"tiendas" is required when sellsProducts is true');
      }
      if (!directoryListing && slugs.some((slug) => slug !== PRODUCT_CATEGORY_SLUG)) {
        throw new BadRequestException('Only "tiendas" is allowed when selling products without Directory presence');
      }
    } else if (slugs.includes(PRODUCT_CATEGORY_SLUG)) {
      throw new BadRequestException('"tiendas" is only allowed when sellsProducts is true');
    }

    return categories.map((c) => c.id);
  }

  private async getUserPetSpeciesIds(userId: string): Promise<string[]> {
    const pets = await this.prisma.pet.findMany({
      where: { ownerId: userId, deletedAt: null },
      select: { speciesId: true },
    });
    return [...new Set(pets.map((p) => p.speciesId))];
  }

  async apply(ownerId: string, dto: ApplyBusinessDto) {
    // RUC signs through a named legal representative (a company can't literally hold a pen);
    // CEDULA IS the person, legalName already carries their name, no separate field needed.
    if (dto.idType === 'RUC' && !dto.representativeName?.trim()) {
      throw new BadRequestException('representativeName is required when idType is RUC');
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

    const speciesIds = await this.resolveSpeciesIds(dto.speciesSlugs);
    const categoryIds = await this.resolveCategoryIds(dto.categorySlugs, dto.sellsProducts, directoryListing);

    const business = await this.prisma.business.create({
      data: {
        ownerId,
        categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
        tradeName: dto.tradeName,
        idType: dto.idType,
        legalName: dto.legalName,
        representativeName: dto.idType === 'RUC' ? dto.representativeName : null,
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
        species: { create: speciesIds.map((speciesId) => ({ speciesId })) },
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
      include: { categories: { include: { category: true } }, documents: true, species: { include: { species: true } } },
    });
    if (!business) throw new NotFoundException('Business not found');
    const capabilities = await this.capabilities.getMap(businessId);
    const { species, categories, ...rest } = business;
    return { ...rest, species: (species ?? []).map((s) => s.species), categories: (categories ?? []).map((c) => c.category), capabilities };
  }

  update(businessId: string, dto: UpdateBusinessDto) {
    return this.prisma.business.update({ where: { id: businessId }, data: dto });
  }

  getCapabilities(businessId: string) {
    return this.capabilities.getMap(businessId);
  }

  /**
   * ADMIN can toggle any capability, including Marketplace/Directory eligibility itself — but
   * *adding* SELLS_PRODUCTS or DIRECTORY_LISTING to an already-ACTIVE business changes what it
   * owes BINGO+ (commission vs. membership fee vs. both), so that one capability doesn't apply
   * immediately: it waits on ContractsService.requestCapabilityChange, which generates an updated
   * contract the business must sign first (ContractsService.sign() is what actually flips it on).
   * Every other capability, and turning one of these two *off*, applies immediately as before.
   */
  async setCapabilityAsAdmin(businessId: string, capability: BusinessCapabilityType, enabled: boolean) {
    const isMaterialAddition =
      enabled &&
      (capability === BusinessCapabilityType.SELLS_PRODUCTS || capability === BusinessCapabilityType.DIRECTORY_LISTING);

    if (isMaterialAddition) {
      const current = await this.capabilities.getMap(businessId);
      const desiredSellsProducts =
        capability === BusinessCapabilityType.SELLS_PRODUCTS ? true : current.SELLS_PRODUCTS;
      const desiredDirectoryListing =
        capability === BusinessCapabilityType.DIRECTORY_LISTING ? true : current.DIRECTORY_LISTING;

      // A newly-added Directory presence needs a membership to actually charge for — same
      // provisioning approve() already does for a business that chose it at onboarding.
      if (capability === BusinessCapabilityType.DIRECTORY_LISTING) {
        await this.memberships.startTrialIfMissing(businessId);
      }

      const outcome = await this.contracts.requestCapabilityChange(businessId, desiredSellsProducts, desiredDirectoryListing);
      if (outcome.requiresSignature) {
        return { requiresSignature: true as const, pendingContractId: outcome.contract!.id };
      }
    }

    const capabilityRow = await this.capabilities.set(businessId, capability, enabled);

    // Turning off the gate cascades off everything that depends on it — those toggles stop being
    // visible to the owner (see the business app's settings page), so they shouldn't stay silently
    // "on" underneath.
    if (!enabled && capability === BusinessCapabilityType.DIRECTORY_LISTING) {
      await this.capabilities.setManyDisabled(businessId, DIRECTORY_DEPENDENT_CAPABILITIES);
    }
    if (!enabled && capability === BusinessCapabilityType.SELLS_PRODUCTS) {
      await this.capabilities.setManyDisabled(businessId, PRODUCTS_DEPENDENT_CAPABILITIES);
    }

    return { requiresSignature: false as const, capability: capabilityRow };
  }

  /**
   * The business owner/manager can only toggle their own *operational* capabilities — whether
   * they sell products at all (SELLS_PRODUCTS) or appear in the Directory (DIRECTORY_LISTING)
   * are platform-eligibility decisions reserved for Admin (mirrors the approve/reject/suspend
   * tier of control), not a business-side self-service toggle. HOME_SERVICE isn't here either —
   * it's derived automatically by ServicesService.resolveLocationType the first time a service is
   * set to AT_CUSTOMER_HOME/BOTH, never toggled directly.
   */
  async setOperationalCapability(businessId: string, capability: BusinessCapabilityType, enabled: boolean) {
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

    // These toggles are hidden from the owner in the UI while their gate is off (Directory for
    // Servicios/Reservas/Cupones/Servicio a domicilio, Venta de productos for Retiro/Delivery) —
    // enforce the same rule server-side so a direct API call can't turn one on regardless.
    if (enabled) {
      const current = await this.capabilities.getMap(businessId);
      if (DIRECTORY_DEPENDENT_CAPABILITIES.includes(capability) && !current.DIRECTORY_LISTING) {
        throw new BadRequestException(
          `"${capability}" requires the Directory listing capability, which this business doesn't have enabled`,
        );
      }
      if (PRODUCTS_DEPENDENT_CAPABILITIES.includes(capability) && !current.SELLS_PRODUCTS) {
        throw new BadRequestException(
          `"${capability}" requires the "sells products" capability, which this business doesn't have enabled`,
        );
      }
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
        include: { categories: { include: { category: true } } },
      }),
    ]);

    const salesByBusiness = await this.countSalesByBusiness(businesses.map((b) => b.id));

    return {
      data: businesses.map((b) => {
        const { categories, ...rest } = b;
        return {
          ...rest,
          categories: categories.map((c) => c.category),
          salesCount: salesByBusiness.get(b.id)?.count ?? 0,
          salesTotal: salesByBusiness.get(b.id)?.total ?? 0,
        };
      }),
      meta: { page, pageSize, total },
    };
  }

  /**
   * Real count/sum of completed Orders per business (0 for everyone until Phase 3's checkout
   * module starts creating orders — an honest empty state, never a placeholder number). Sums
   * `subtotal` (net of discount, pre-tax/fees) rather than `total` — BINGO+'s commission is a
   * percentage of the sale itself, never of the tax or customer-facing fee lines stacked on top.
   */
  private async countSalesByBusiness(
    businessIds: string[],
  ): Promise<Map<string, { count: number; total: number }>> {
    if (businessIds.length === 0) return new Map();
    const grouped = await this.prisma.order.groupBy({
      by: ['businessId'],
      where: { businessId: { in: businessIds }, status: { not: 'CANCELLED' } },
      _count: { _all: true },
      _sum: { subtotal: true },
    });
    return new Map(
      grouped.map((g) => [g.businessId, { count: g._count._all, total: Number(g._sum.subtotal ?? 0) }]),
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
        // A promotional (CommissionCoupon-redeemed) row whose expiresAt has passed is excluded —
        // the previous, non-expiring row then naturally becomes "latest" again below, with no
        // scheduled job needed to revert it (see the schema comment on Commission.expiresAt).
        where: { businessId: { in: businessIds }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
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
      this.prisma.commission.findFirst({
        where: { businessId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        orderBy: { effectiveFrom: 'desc' },
      }),
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

    // Approval alone never makes a business ACTIVE (visible in Marketplace/Directory) anymore —
    // it now waits on this contract actually being signed (ContractsService.sign() is what calls
    // activate() going forward). The commission row above must exist first: the contract's fee
    // clause quotes it verbatim rather than inventing a number.
    await this.contracts.createForApprovedBusiness(businessId);

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

  /** Admin-facing read of the same value approve() falls back to when no manual commissionRate
   * is given — this is the "Negocios" side of Precios y comisiones, distinct from Commission.rate
   * (frozen per-business once a contract is signed) and from anything customer-facing. */
  getDefaultCommissionRateForAdmin() {
    return this.getDefaultCommissionRate();
  }

  async setDefaultCommissionRate(rate: number, updatedBy?: string): Promise<number> {
    await this.prisma.platformSetting.upsert({
      where: { key: DEFAULT_COMMISSION_SETTING_KEY },
      update: { value: rate, updatedBy },
      create: { key: DEFAULT_COMMISSION_SETTING_KEY, value: rate, updatedBy },
    });
    return rate;
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
