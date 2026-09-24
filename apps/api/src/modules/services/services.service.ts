import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BusinessCapabilityType, BusinessStatus, Prisma, ServiceLocationType, ServiceType } from '@prisma/client';
import { estimateTravelMinutes, haversineKm, resolvePagination } from '@bingoplus/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessCapabilitiesService } from '../business-capabilities/business-capabilities.service';
import { membershipGoodStandingWhere } from '../memberships/membership-visibility.util';
import { CreateServiceDto } from './dto/create-service.dto';

/** DAYCARE/BOARDING are booked by date range (see BookingsService), never a time slot — they must
 * declare which weekdays they actually operate so a check-in/check-out range knows what to count. */
const DAY_UNIT_TYPES: ServiceType[] = [ServiceType.DAYCARE, ServiceType.BOARDING];

/** Each ServiceType maps 1:1 onto the BusinessCategory slug a business must have picked at
 * onboarding to offer it — a business only categorized as "Grooming" shouldn't be able to create a
 * VETERINARY service, since "Tipo de servicio" is meant to reflect what the business actually is,
 * not an open menu. "tiendas" has no entry: a products-only category never grants a service type. */
const SERVICE_TYPE_CATEGORY_SLUGS: Record<ServiceType, string> = {
  [ServiceType.VETERINARY]: 'veterinarios',
  [ServiceType.DAYCARE]: 'guarderias',
  [ServiceType.BOARDING]: 'hospedajes',
  [ServiceType.GROOMING]: 'grooming',
  [ServiceType.DOG_WALKING]: 'paseadores',
  [ServiceType.TRAINING]: 'adiestradores',
  [ServiceType.OTHER]: 'otros-pet-services',
};
import { UpdateServiceDto } from './dto/update-service.dto';
import {
  ListAdminServicesQueryDto,
  ListBusinessServicesQueryDto,
  ListPublicServicesQueryDto,
} from './dto/list-services-query.dto';

/** A service with no explicit capacity is treated as single-provider (one booking per slot) —
 * never silently unlimited, since that would let BookingsService double-book it. */
export const DEFAULT_SERVICE_CAPACITY = 1;

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capabilities: BusinessCapabilitiesService,
  ) {}

  // ── Public (customer-facing) ─────────────────────────────────────────────

  async listPublic(query: ListPublicServicesQueryDto) {
    const where: Prisma.ServiceWhereInput = {
      active: true,
      deletedAt: null,
      business: {
        status: BusinessStatus.ACTIVE,
        deletedAt: null,
        capabilities: { some: { capability: BusinessCapabilityType.SERVICES, enabled: true } },
        ...membershipGoodStandingWhere(),
      },
      ...(query.businessId ? { businessId: query.businessId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.species
        ? { OR: [{ species: { none: {} } }, { species: { some: { species: { slug: query.species } } } }] }
        : {}),
    };
    const services = await this.prisma.service.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { species: { include: { species: true } } },
    });
    return services.map((s) => this.withSpeciesNames(s));
  }

  async getPublic(serviceId: string, customerLocation?: { lat: number; lng: number }) {
    const service = await this.prisma.service.findFirst({
      where: {
        id: serviceId,
        active: true,
        deletedAt: null,
        business: {
          status: BusinessStatus.ACTIVE,
          deletedAt: null,
          capabilities: { some: { capability: BusinessCapabilityType.SERVICES, enabled: true } },
          ...membershipGoodStandingWhere(),
        },
      },
      include: {
        species: { include: { species: true } },
        business: {
          select: {
            id: true,
            tradeName: true,
            city: true,
            addressLine: true,
            logoUrl: true,
            openingHours: true,
            latitude: true,
            longitude: true,
            phone: true,
          },
        },
      },
    });
    if (!service) throw new NotFoundException('Service not found');
    const bookingsEnabled = await this.prisma.businessCapability.findUnique({
      where: { businessId_capability: { businessId: service.businessId, capability: BusinessCapabilityType.BOOKINGS } },
    });
    // "X min de distancia" reference (see BusinessesService.getPublicBusiness for the same pattern).
    const distanceKm =
      customerLocation && service.business.latitude != null && service.business.longitude != null
        ? haversineKm(customerLocation, { lat: service.business.latitude, lng: service.business.longitude })
        : null;
    return {
      ...this.withSpeciesNames(service),
      bookingsEnabled: bookingsEnabled?.enabled ?? false,
      distanceKm,
      etaMinutes: distanceKm !== null ? estimateTravelMinutes(distanceKm) : null,
    };
  }

  /** Flattens the ServiceSpecies join into a plain `species: PetSpecies[]` array for API responses. */
  private withSpeciesNames<T extends { species: { species: { id: string; name: string; slug: string } }[] }>(service: T) {
    const { species, ...rest } = service;
    return { ...rest, species: species.map((s) => s.species) };
  }

  // ── Admin-facing — global visibility, never a second management surface ──

  async listForAdmin(query: ListAdminServicesQueryDto) {
    const { skip, take, page, pageSize } = resolvePagination(query);
    const where: Prisma.ServiceWhereInput = {
      deletedAt: null,
      ...(query.businessId ? { businessId: query.businessId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const [total, services] = await this.prisma.$transaction([
      this.prisma.service.count({ where }),
      this.prisma.service.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { species: { include: { species: true } }, business: { select: { id: true, tradeName: true } } },
      }),
    ]);
    return { data: services.map((s) => this.withSpeciesNames(s)), meta: { page, pageSize, total } };
  }

  async getForAdmin(serviceId: string) {
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      include: { species: { include: { species: true } }, business: { select: { id: true, tradeName: true } } },
    });
    if (!service) throw new NotFoundException('Service not found');
    return this.withSpeciesNames(service);
  }

  // ── Business-owner facing ────────────────────────────────────────────────

  async listForBusiness(businessId: string, query: ListBusinessServicesQueryDto) {
    const { skip, take, page, pageSize } = resolvePagination(query);
    const where: Prisma.ServiceWhereInput = {
      businessId,
      deletedAt: null,
      ...(query.active !== undefined ? { active: query.active } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const [total, services] = await this.prisma.$transaction([
      this.prisma.service.count({ where }),
      this.prisma.service.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { species: { include: { species: true } } },
      }),
    ]);
    return { data: services.map((s) => this.withSpeciesNames(s)), meta: { page, pageSize, total } };
  }

  async getForBusiness(businessId: string, serviceId: string) {
    const service = await this.assertOwnedService(businessId, serviceId);
    const full = await this.prisma.service.findUniqueOrThrow({
      where: { id: service.id },
      include: { species: { include: { species: true } } },
    });
    return this.withSpeciesNames(full);
  }

  async create(businessId: string, dto: CreateServiceDto) {
    this.validateAgeRange(dto.minAgeMonths, dto.maxAgeMonths);
    this.validateOperatingDays(dto.type, dto.operatingDays);
    await this.validateTypeMatchesCategory(businessId, dto.type);
    const speciesIds = await this.resolveSpeciesIds(dto.speciesSlugs);
    const locationType = await this.resolveLocationType(businessId, dto.locationType);
    return this.prisma.service.create({
      data: {
        businessId,
        type: dto.type,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        durationMinutes: dto.durationMinutes,
        operatingDays: DAY_UNIT_TYPES.includes(dto.type) ? dto.operatingDays ?? [] : [],
        capacity: dto.capacity,
        imageUrl: dto.imageUrl,
        requirements: dto.requirements,
        minAgeMonths: dto.minAgeMonths,
        maxAgeMonths: dto.maxAgeMonths,
        locationType,
        species: speciesIds ? { create: speciesIds.map((speciesId) => ({ speciesId })) } : undefined,
      },
    });
  }

  async update(businessId: string, serviceId: string, dto: UpdateServiceDto) {
    const current = await this.assertOwnedService(businessId, serviceId);
    this.validateAgeRange(dto.minAgeMonths, dto.maxAgeMonths);
    const effectiveType = dto.type ?? current.type;
    if (dto.operatingDays !== undefined || dto.type !== undefined) {
      this.validateOperatingDays(effectiveType, dto.operatingDays ?? current.operatingDays);
    }
    if (dto.type !== undefined) {
      await this.validateTypeMatchesCategory(businessId, dto.type);
    }
    const { speciesSlugs, locationType: dtoLocationType, ...rest } = dto;
    const speciesIds = await this.resolveSpeciesIds(speciesSlugs);
    const locationType =
      dtoLocationType !== undefined ? await this.resolveLocationType(businessId, dtoLocationType) : undefined;
    return this.prisma.service.update({
      where: { id: serviceId },
      data: {
        ...rest,
        // Switching a service OUT of DAYCARE/BOARDING clears operatingDays — it's meaningless (and
        // potentially stale/misleading) for every other type.
        operatingDays: !DAY_UNIT_TYPES.includes(effectiveType) ? [] : dto.operatingDays,
        locationType,
        species: speciesIds ? { deleteMany: {}, create: speciesIds.map((speciesId) => ({ speciesId })) } : undefined,
      },
    });
  }

  /** Freely choosable on every service — no capability prerequisite. The first time a business
   * uses AT_CUSTOMER_HOME/BOTH, this auto-enables HOME_SERVICE so it stays an accurate, derived
   * signal (consumed by BusinessesService.resolveHasPhysicalLocation to decide whether "Cómo
   * llegar" makes sense to show) rather than something the owner has to remember to turn on first. */
  private async resolveLocationType(
    businessId: string,
    requested?: ServiceLocationType,
  ): Promise<ServiceLocationType> {
    if (!requested || requested === ServiceLocationType.AT_BUSINESS) return ServiceLocationType.AT_BUSINESS;
    await this.capabilities.set(businessId, BusinessCapabilityType.HOME_SERVICE, true);
    return requested;
  }

  private validateOperatingDays(type: ServiceType, operatingDays?: string[]) {
    if (DAY_UNIT_TYPES.includes(type) && (!operatingDays || operatingDays.length === 0)) {
      throw new BadRequestException('operatingDays is required for DAYCARE/BOARDING services');
    }
  }

  /** A service's type must match one of the business's own onboarding categories — see
   * SERVICE_TYPE_CATEGORY_SLUGS. Mirrors the owner-facing form only offering the matching subset. */
  private async validateTypeMatchesCategory(businessId: string, type: ServiceType) {
    const requiredSlug = SERVICE_TYPE_CATEGORY_SLUGS[type];
    const link = await this.prisma.businessCategoryLink.findFirst({
      where: { businessId, category: { slug: requiredSlug } },
    });
    if (!link) {
      throw new BadRequestException(
        `This business isn't registered under the "${requiredSlug}" category, so it can't create a "${type}" service`,
      );
    }
  }

  async activate(businessId: string, serviceId: string) {
    await this.assertOwnedService(businessId, serviceId);
    return this.prisma.service.update({ where: { id: serviceId }, data: { active: true } });
  }

  async deactivate(businessId: string, serviceId: string) {
    await this.assertOwnedService(businessId, serviceId);
    return this.prisma.service.update({ where: { id: serviceId }, data: { active: false } });
  }

  private validateAgeRange(minAgeMonths?: number, maxAgeMonths?: number) {
    if (minAgeMonths !== undefined && maxAgeMonths !== undefined && minAgeMonths > maxAgeMonths) {
      throw new BadRequestException('minAgeMonths cannot be greater than maxAgeMonths');
    }
  }

  private async resolveSpeciesIds(slugs?: string[]): Promise<string[] | undefined> {
    if (slugs === undefined) return undefined;
    if (slugs.length === 0) return [];
    const species = await this.prisma.petSpecies.findMany({ where: { slug: { in: slugs } } });
    const unknown = slugs.filter((slug) => !species.some((s) => s.slug === slug));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown pet species: ${unknown.join(', ')}`);
    }
    return species.map((s) => s.id);
  }

  async assertOwnedService(businessId: string, serviceId: string) {
    const service = await this.prisma.service.findUnique({ where: { id: serviceId } });
    if (!service || service.businessId !== businessId || service.deletedAt) {
      throw new NotFoundException('Service not found');
    }
    return service;
  }

  /** Soft delete, same pattern as CatalogService.remove — a hard delete would violate the FK from
   * any past Booking still pointing at this service. */
  async remove(businessId: string, serviceId: string) {
    await this.assertOwnedService(businessId, serviceId);
    await this.prisma.service.update({ where: { id: serviceId }, data: { deletedAt: new Date() } });
  }
}
