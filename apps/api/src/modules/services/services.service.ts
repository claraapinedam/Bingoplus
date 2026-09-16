import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BusinessCapabilityType, BusinessStatus, Prisma } from '@prisma/client';
import { resolvePagination } from '@bingoplus/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
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
  constructor(private readonly prisma: PrismaService) {}

  // ── Public (customer-facing) ─────────────────────────────────────────────

  async listPublic(query: ListPublicServicesQueryDto) {
    const where: Prisma.ServiceWhereInput = {
      active: true,
      business: {
        status: BusinessStatus.ACTIVE,
        deletedAt: null,
        capabilities: { some: { capability: BusinessCapabilityType.SERVICES, enabled: true } },
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

  async getPublic(serviceId: string) {
    const service = await this.prisma.service.findFirst({
      where: {
        id: serviceId,
        active: true,
        business: {
          status: BusinessStatus.ACTIVE,
          deletedAt: null,
          capabilities: { some: { capability: BusinessCapabilityType.SERVICES, enabled: true } },
        },
      },
      include: {
        species: { include: { species: true } },
        business: { select: { id: true, tradeName: true, city: true, addressLine: true, logoUrl: true, openingHours: true } },
      },
    });
    if (!service) throw new NotFoundException('Service not found');
    const bookingsEnabled = await this.prisma.businessCapability.findUnique({
      where: { businessId_capability: { businessId: service.businessId, capability: BusinessCapabilityType.BOOKINGS } },
    });
    return { ...this.withSpeciesNames(service), bookingsEnabled: bookingsEnabled?.enabled ?? false };
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
    const speciesIds = await this.resolveSpeciesIds(dto.speciesSlugs);
    return this.prisma.service.create({
      data: {
        businessId,
        type: dto.type,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        durationMinutes: dto.durationMinutes,
        capacity: dto.capacity,
        imageUrl: dto.imageUrl,
        requirements: dto.requirements,
        minAgeMonths: dto.minAgeMonths,
        maxAgeMonths: dto.maxAgeMonths,
        species: speciesIds ? { create: speciesIds.map((speciesId) => ({ speciesId })) } : undefined,
      },
    });
  }

  async update(businessId: string, serviceId: string, dto: UpdateServiceDto) {
    await this.assertOwnedService(businessId, serviceId);
    this.validateAgeRange(dto.minAgeMonths, dto.maxAgeMonths);
    const { speciesSlugs, ...rest } = dto;
    const speciesIds = await this.resolveSpeciesIds(speciesSlugs);
    return this.prisma.service.update({
      where: { id: serviceId },
      data: {
        ...rest,
        species: speciesIds ? { deleteMany: {}, create: speciesIds.map((speciesId) => ({ speciesId })) } : undefined,
      },
    });
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
    if (!service || service.businessId !== businessId) throw new NotFoundException('Service not found');
    return service;
  }
}
