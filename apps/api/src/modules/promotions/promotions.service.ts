import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BusinessStatus, Prisma, PromotionStatus, PromotionTargetType, PromotionType } from '@prisma/client';
import { resolvePagination } from '@bingoplus/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { ListAdminPromotionsQueryDto, ListPublicPromotionsQueryDto } from './dto/list-promotions-query.dto';

const PROMOTION_INCLUDE = { targets: true } satisfies Prisma.PromotionInclude;

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Business-owner facing ────────────────────────────────────────────────

  async listForBusiness(businessId: string, status?: PromotionStatus) {
    return this.prisma.promotion.findMany({
      where: { businessId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      include: PROMOTION_INCLUDE,
    });
  }

  async getForBusiness(businessId: string, id: string) {
    return this.assertOwnedPromotion(businessId, id);
  }

  async create(businessId: string, dto: CreatePromotionDto) {
    this.validateDates(dto.startDate, dto.endDate);
    this.validateValue(dto.type, dto.value);
    const targets = await this.resolveTargets(businessId, dto.targets);

    return this.prisma.promotion.create({
      data: {
        businessId,
        name: dto.name,
        description: dto.description,
        type: dto.type,
        value: dto.value,
        minimumPurchase: dto.minimumPurchase,
        maximumDiscount: dto.maximumDiscount,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        targets: { create: targets },
      },
      include: PROMOTION_INCLUDE,
    });
  }

  async update(businessId: string, id: string, dto: UpdatePromotionDto) {
    const promotion = await this.assertOwnedPromotion(businessId, id);
    if (promotion.status !== PromotionStatus.DRAFT) {
      throw new BadRequestException('Only a DRAFT promotion can be edited — pause or cancel an active one instead of changing its terms mid-flight.');
    }
    if (dto.startDate || dto.endDate) {
      this.validateDates(dto.startDate ?? promotion.startDate.toISOString(), dto.endDate ?? promotion.endDate.toISOString());
    }
    if (dto.type || dto.value !== undefined) {
      this.validateValue(dto.type ?? promotion.type, dto.value ?? Number(promotion.value));
    }
    const targets = dto.targets ? await this.resolveTargets(businessId, dto.targets) : undefined;

    return this.prisma.promotion.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        type: dto.type,
        value: dto.value,
        minimumPurchase: dto.minimumPurchase,
        maximumDiscount: dto.maximumDiscount,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        targets: targets ? { deleteMany: {}, create: targets } : undefined,
      },
      include: PROMOTION_INCLUDE,
    });
  }

  async activate(businessId: string, id: string) {
    const promotion = await this.assertOwnedPromotion(businessId, id);
    if (promotion.status !== PromotionStatus.DRAFT && promotion.status !== PromotionStatus.PAUSED) {
      throw new BadRequestException('Only a DRAFT or PAUSED promotion can be activated.');
    }
    if (promotion.endDate.getTime() <= Date.now()) {
      throw new BadRequestException('This promotion\'s end date has already passed — update the dates before activating it.');
    }
    return this.prisma.promotion.update({ where: { id }, data: { status: PromotionStatus.ACTIVE }, include: PROMOTION_INCLUDE });
  }

  async pause(businessId: string, id: string) {
    const promotion = await this.assertOwnedPromotion(businessId, id);
    if (promotion.status !== PromotionStatus.ACTIVE) {
      throw new BadRequestException('Only an ACTIVE promotion can be paused.');
    }
    return this.prisma.promotion.update({ where: { id }, data: { status: PromotionStatus.PAUSED }, include: PROMOTION_INCLUDE });
  }

  async cancel(businessId: string, id: string) {
    const promotion = await this.assertOwnedPromotion(businessId, id);
    if (promotion.status === PromotionStatus.CANCELLED || promotion.status === PromotionStatus.EXPIRED) {
      throw new BadRequestException('This promotion is already over.');
    }
    return this.prisma.promotion.update({ where: { id }, data: { status: PromotionStatus.CANCELLED }, include: PROMOTION_INCLUDE });
  }

  // ── Public (customer-facing) discovery — §4.5: never expired/paused/cancelled/out-of-range,
  // never from an inactive business, never for an unavailable product/service. ─────────────────

  async listActiveForCustomer(query: ListPublicPromotionsQueryDto) {
    const now = new Date();
    const businessWhere: Prisma.BusinessWhereInput = { status: BusinessStatus.ACTIVE, deletedAt: null };

    let targetFilter: Prisma.PromotionWhereInput = {};
    if (query.productId) {
      const product = await this.prisma.product.findUnique({ where: { id: query.productId }, select: { businessId: true, categoryId: true, status: true, deletedAt: true } });
      if (!product || product.status !== 'ACTIVE' || product.deletedAt) return [];
      targetFilter = {
        businessId: product.businessId,
        targets: { some: { OR: [{ targetType: PromotionTargetType.BUSINESS }, { targetType: PromotionTargetType.PRODUCT, targetId: query.productId }, { targetType: PromotionTargetType.PRODUCT_CATEGORY, targetId: product.categoryId }] } },
      };
    } else if (query.serviceId) {
      const service = await this.prisma.service.findUnique({ where: { id: query.serviceId }, select: { businessId: true, active: true } });
      if (!service || !service.active) return [];
      targetFilter = {
        businessId: service.businessId,
        targets: { some: { OR: [{ targetType: PromotionTargetType.BUSINESS }, { targetType: PromotionTargetType.SERVICE, targetId: query.serviceId }] } },
      };
    } else if (query.businessId) {
      targetFilter = { businessId: query.businessId };
    }

    return this.prisma.promotion.findMany({
      where: {
        status: PromotionStatus.ACTIVE,
        startDate: { lte: now },
        endDate: { gte: now },
        business: businessWhere,
        ...targetFilter,
      },
      orderBy: { createdAt: 'desc' },
      include: { ...PROMOTION_INCLUDE, business: { select: { id: true, tradeName: true } } },
    });
  }

  // ── Admin — global read-only supervision ────────────────────────────────

  async listForAdmin(query: ListAdminPromotionsQueryDto) {
    const { skip, take, page, pageSize } = resolvePagination(query);
    const where: Prisma.PromotionWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.businessId ? { businessId: query.businessId } : {}),
    };
    const [total, promotions] = await this.prisma.$transaction([
      this.prisma.promotion.count({ where }),
      this.prisma.promotion.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { ...PROMOTION_INCLUDE, business: { select: { id: true, tradeName: true } } },
      }),
    ]);
    return { data: promotions, meta: { page, pageSize, total } };
  }

  async getForAdmin(id: string) {
    const promotion = await this.prisma.promotion.findUnique({
      where: { id },
      include: { ...PROMOTION_INCLUDE, business: { select: { id: true, tradeName: true } } },
    });
    if (!promotion) throw new NotFoundException('Promotion not found');
    return promotion;
  }

  // ── Shared ────────────────────────────────────────────────────────────────

  private validateDates(startDate: string, endDate: string) {
    if (new Date(endDate).getTime() <= new Date(startDate).getTime()) {
      throw new BadRequestException('endDate must be after startDate');
    }
  }

  private validateValue(type: PromotionType, value: number) {
    if (type === PromotionType.PERCENTAGE && value > 100) {
      throw new BadRequestException('A PERCENTAGE promotion cannot exceed 100');
    }
  }

  private async resolveTargets(businessId: string, targets: { targetType: PromotionTargetType; targetId?: string }[]) {
    const resolved: { targetType: PromotionTargetType; targetId: string }[] = [];
    for (const t of targets) {
      if (t.targetType === PromotionTargetType.BUSINESS) {
        resolved.push({ targetType: t.targetType, targetId: businessId });
        continue;
      }
      if (!t.targetId) {
        throw new BadRequestException(`targetId is required for target type ${t.targetType}`);
      }
      if (t.targetType === PromotionTargetType.PRODUCT) {
        const product = await this.prisma.product.findUnique({ where: { id: t.targetId }, select: { businessId: true } });
        if (!product || product.businessId !== businessId) {
          throw new BadRequestException(`Product ${t.targetId} does not belong to this business`);
        }
      } else if (t.targetType === PromotionTargetType.SERVICE) {
        const service = await this.prisma.service.findUnique({ where: { id: t.targetId }, select: { businessId: true } });
        if (!service || service.businessId !== businessId) {
          throw new BadRequestException(`Service ${t.targetId} does not belong to this business`);
        }
      } else if (t.targetType === PromotionTargetType.PRODUCT_CATEGORY) {
        const category = await this.prisma.productCategory.findUnique({ where: { id: t.targetId } });
        if (!category) throw new BadRequestException(`Unknown product category ${t.targetId}`);
      }
      resolved.push({ targetType: t.targetType, targetId: t.targetId });
    }
    return resolved;
  }

  private async assertOwnedPromotion(businessId: string, id: string) {
    const promotion = await this.prisma.promotion.findUnique({ where: { id }, include: PROMOTION_INCLUDE });
    if (!promotion || promotion.businessId !== businessId) throw new NotFoundException('Promotion not found');
    return promotion;
  }
}
