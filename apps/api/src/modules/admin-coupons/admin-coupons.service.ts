import { Injectable, NotFoundException } from '@nestjs/common';
import { AdminCouponStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAdminCouponDto, UpdateAdminCouponDto } from './dto/admin-coupon.dto';

/**
 * AdminCoupon discounts what a business owes BINGO+ for membership — kept deliberately separate
 * from BusinessCoupon (RULE 16/17). Actual redemption/validation logic lives in
 * MembershipsService.redeemAdminCoupon (it needs the target BusinessMembership); this service is
 * just the Admin-side CRUD for the coupon definitions themselves.
 */
@Injectable()
export class AdminCouponsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.adminCoupon.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async getOne(id: string) {
    const coupon = await this.prisma.adminCoupon.findUnique({
      where: { id },
      include: { redemptions: { orderBy: { redeemedAt: 'desc' }, take: 20 } },
    });
    if (!coupon) throw new NotFoundException('Coupon not found');
    return coupon;
  }

  create(dto: CreateAdminCouponDto, createdBy: string) {
    return this.prisma.adminCoupon.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        freeMonths: dto.freeMonths,
        startDate: new Date(dto.startDate),
        expirationDate: new Date(dto.expirationDate),
        usageLimit: dto.usageLimit,
        usagePerBusiness: dto.usagePerBusiness,
        applicablePlans: dto.applicablePlans ?? [],
        termsAndConditions: dto.termsAndConditions,
        status: AdminCouponStatus.DRAFT,
        createdBy,
      },
    });
  }

  async update(id: string, dto: UpdateAdminCouponDto) {
    await this.getOne(id);
    const { startDate, expirationDate, ...rest } = dto;
    return this.prisma.adminCoupon.update({
      where: { id },
      data: {
        ...rest,
        startDate: startDate ? new Date(startDate) : undefined,
        expirationDate: expirationDate ? new Date(expirationDate) : undefined,
      },
    });
  }

  async setStatus(id: string, status: AdminCouponStatus) {
    await this.getOne(id);
    return this.prisma.adminCoupon.update({ where: { id }, data: { status } });
  }
}
