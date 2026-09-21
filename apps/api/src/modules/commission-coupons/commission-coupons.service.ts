import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminCouponStatus, CommissionCouponTargetType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCommissionCouponDto, UpdateCommissionCouponDto } from './dto/commission-coupon.dto';

/**
 * Admin-side CRUD for CommissionCoupon definitions, plus the redemption logic itself — unlike
 * AdminCoupon (whose redemption lives in MembershipsService, since it needs BusinessMembership),
 * a commission coupon's effect (a new Commission row or RiderCommissionOverride row) is simple
 * enough to write directly here without a cross-module dependency.
 */
@Injectable()
export class CommissionCouponsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.commissionCoupon.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { redemptions: true } } },
    });
  }

  async getOne(id: string) {
    const coupon = await this.prisma.commissionCoupon.findUnique({
      where: { id },
      include: {
        redemptions: {
          orderBy: { redeemedAt: 'desc' },
          take: 20,
          include: {
            business: { select: { tradeName: true } },
            rider: { select: { user: { select: { firstName: true, lastName: true } } } },
          },
        },
      },
    });
    if (!coupon) throw new NotFoundException('Coupon not found');
    return coupon;
  }

  create(dto: CreateCommissionCouponDto, createdBy: string) {
    return this.prisma.commissionCoupon.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        targetType: dto.targetType,
        commissionPercent: dto.commissionPercent,
        startDate: new Date(dto.startDate),
        expirationDate: new Date(dto.expirationDate),
        usageLimit: dto.usageLimit,
        status: AdminCouponStatus.DRAFT,
        createdBy,
      },
    });
  }

  async update(id: string, dto: UpdateCommissionCouponDto) {
    await this.getOne(id);
    const { startDate, expirationDate, ...rest } = dto;
    return this.prisma.commissionCoupon.update({
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
    return this.prisma.commissionCoupon.update({ where: { id }, data: { status } });
  }

  /** Coupon-level checks shared by both redemption paths (status, date range, usage limit) — only
   * the targetType match and the per-redeemer "already used" check differ between them. */
  private async validateForRedemption(tx: Prisma.TransactionClient, code: string, targetType: CommissionCouponTargetType) {
    const coupon = await tx.commissionCoupon.findUnique({ where: { code } });
    if (!coupon) throw new NotFoundException('Coupon not found');
    if (coupon.targetType !== targetType) {
      throw new BadRequestException('This coupon is not valid for your account type');
    }
    if (coupon.status !== AdminCouponStatus.ACTIVE) {
      throw new BadRequestException('This coupon is not active');
    }
    const now = new Date();
    if (now < coupon.startDate || now > coupon.expirationDate) {
      throw new BadRequestException('This coupon is not within its valid date range');
    }
    if (coupon.usageLimit !== null) {
      const totalRedemptions = await tx.commissionCouponRedemption.count({ where: { couponId: coupon.id } });
      if (totalRedemptions >= coupon.usageLimit) {
        throw new BadRequestException('This coupon has reached its usage limit');
      }
    }
    return coupon;
  }

  /** Writes a new, time-bound Commission row for the business — the existing "latest non-expired
   * row wins" read pattern (see BusinessesService.getCommissionSummary) picks it up immediately and
   * automatically reverts to the business's previous rate once expiresAt passes. */
  async redeemForBusiness(businessId: string, code: string) {
    return this.prisma.$transaction(async (tx) => {
      const alreadyRedeemed = await tx.commissionCouponRedemption.findFirst({ where: { businessId, coupon: { code } } });
      if (alreadyRedeemed) throw new BadRequestException('Your business has already redeemed this coupon');

      const coupon = await this.validateForRedemption(tx, code, CommissionCouponTargetType.BUSINESS);

      await tx.commission.create({
        data: { businessId, rate: coupon.commissionPercent, expiresAt: coupon.expirationDate },
      });

      return tx.commissionCouponRedemption.create({ data: { couponId: coupon.id, businessId } });
    });
  }

  /** Writes a new, time-bound RiderCommissionOverride row — DeliveryService.complete() checks for
   * one before falling back to the platform-wide DeliveryFareConfig.bingoCommissionPercent. */
  async redeemForRider(riderId: string, code: string) {
    return this.prisma.$transaction(async (tx) => {
      const alreadyRedeemed = await tx.commissionCouponRedemption.findFirst({ where: { riderId, coupon: { code } } });
      if (alreadyRedeemed) throw new BadRequestException('You have already redeemed this coupon');

      const coupon = await this.validateForRedemption(tx, code, CommissionCouponTargetType.RIDER);

      await tx.riderCommissionOverride.create({
        data: { riderId, bingoCommissionPercent: coupon.commissionPercent, expiresAt: coupon.expirationDate },
      });

      return tx.commissionCouponRedemption.create({ data: { couponId: coupon.id, riderId } });
    });
  }
}
