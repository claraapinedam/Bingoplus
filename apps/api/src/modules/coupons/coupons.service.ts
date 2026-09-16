import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as QRCode from 'qrcode';
import { BusinessCapabilityType, BusinessCouponStatus, BusinessStatus, Prisma } from '@prisma/client';
import { resolvePagination } from '@bingoplus/utils';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessCapabilitiesService } from '../business-capabilities/business-capabilities.service';
import { MembershipsService } from '../memberships/memberships.service';
import {
  CouponCustomerLimitReachedException,
  CouponExpiredException,
  CouponInvalidException,
  CouponMinimumPurchaseException,
  CouponNotActiveException,
  CouponNotFoundException,
  CouponUsageLimitReachedException,
  CouponWrongBusinessException,
} from '../../common/exceptions/coupon.exceptions';
import { CreateBusinessCouponDto, UpdateBusinessCouponDto } from './dto/business-coupon.dto';

interface RedemptionTokenPayload {
  couponId: string;
  customerId: string;
}

const REDEMPTION_TOKEN_TTL_SECONDS = 5 * 60;

/**
 * Business coupons are redeemed presentially, never at Marketplace checkout (RULE 14/15). The
 * QR a customer shows encodes a short-lived, signed token (never the discount amount or any
 * other sensitive detail) — the business scans it and the backend re-validates every rule from
 * scratch (RULE 19/20) before recording a CouponRedemption.
 */
@Injectable()
export class CouponsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capabilities: BusinessCapabilitiesService,
    private readonly memberships: MembershipsService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async listForBusiness(businessId: string) {
    return this.prisma.businessCoupon.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Admin-facing (FASE 6 §17) — global read-only supervision across every business's own
   * coupons, never to be confused with AdminCoupon (a completely separate model/financial
   * domain — see AdminCouponsService). Businesses keep full ownership of theirs via
   * BusinessCouponsController; this is visibility only, no admin write path onto BusinessCoupon. */
  async listForAdmin(query: { status?: BusinessCouponStatus; businessId?: string; search?: string; page?: number; pageSize?: number }) {
    const { skip, take, page, pageSize } = resolvePagination(query);
    const where: Prisma.BusinessCouponWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.businessId ? { businessId: query.businessId } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' } },
              { title: { contains: query.search, mode: 'insensitive' } },
              { business: { tradeName: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [total, coupons] = await this.prisma.$transaction([
      this.prisma.businessCoupon.count({ where }),
      this.prisma.businessCoupon.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { business: { select: { id: true, tradeName: true } } },
      }),
    ]);
    return { data: coupons, meta: { page, pageSize, total } };
  }

  /** What a customer browsing this business can see — only currently-active, in-date coupons. */
  async listActiveForCustomers(businessId: string) {
    const now = new Date();
    return this.prisma.businessCoupon.findMany({
      where: {
        businessId,
        status: BusinessCouponStatus.ACTIVE,
        startDate: { lte: now },
        expirationDate: { gte: now },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * §"COUPON VISIBILITY RULE": the exact three-state check a Directory business detail needs —
   * COUPONS off, COUPONS on with none active, or COUPONS on with ≥1 active — computed once here
   * so the frontend never has to (and can't accidentally) derive "Ver cupón" visibility itself.
   */
  async getCouponSummary(businessId: string): Promise<{ hasActiveCoupons: boolean; count: number }> {
    const hasCouponsCapability = await this.capabilities.has(businessId, BusinessCapabilityType.COUPONS);
    if (!hasCouponsCapability) return { hasActiveCoupons: false, count: 0 };
    const count = await this.prisma.businessCoupon.count({
      where: {
        businessId,
        status: BusinessCouponStatus.ACTIVE,
        startDate: { lte: new Date() },
        expirationDate: { gte: new Date() },
      },
    });
    return { hasActiveCoupons: count > 0, count };
  }

  /** §41: full public detail for "Ver cupón" — name, discount, conditions, dates, terms, business. */
  async getPublicDetail(couponId: string) {
    const coupon = await this.prisma.businessCoupon.findFirst({
      where: { id: couponId, status: BusinessCouponStatus.ACTIVE },
      include: { business: { select: { id: true, tradeName: true, logoUrl: true, addressLine: true, city: true } } },
    });
    if (!coupon) throw new CouponNotFoundException();
    return coupon;
  }

  /**
   * "Ofertas" on Home: real businesses that currently have at least one redeemable coupon —
   * never a fabricated discount. Grouped by business so a store with several active coupons
   * shows its earliest-created one plus a real "N más" count, matching what the storefront
   * itself would show via listActiveForCustomers.
   */
  async listBusinessesWithActiveOffers() {
    const now = new Date();
    const coupons = await this.prisma.businessCoupon.findMany({
      where: { status: BusinessCouponStatus.ACTIVE, startDate: { lte: now }, expirationDate: { gte: now } },
      orderBy: { createdAt: 'asc' },
      include: { business: { include: { category: true } } },
    });

    const byBusiness = new Map<string, { business: (typeof coupons)[number]['business']; coupons: typeof coupons }>();
    for (const c of coupons) {
      if (c.business.status !== BusinessStatus.ACTIVE || c.business.deletedAt) continue;
      const entry = byBusiness.get(c.businessId);
      if (entry) entry.coupons.push(c);
      else byBusiness.set(c.businessId, { business: c.business, coupons: [c] });
    }

    const businessIds = [...byBusiness.keys()];
    const capabilityMaps = await this.capabilities.getMapForMany(businessIds);

    return businessIds.map((id) => {
      const { business: b, coupons: cs } = byBusiness.get(id)!;
      const [primary, ...rest] = cs;
      return {
        id: b.id,
        tradeName: b.tradeName,
        description: b.description,
        logoUrl: b.logoUrl,
        coverImageUrl: b.coverImageUrl,
        city: b.city,
        category: { id: b.category.id, name: b.category.name, slug: b.category.slug },
        ratingAvg: b.ratingAvg,
        reviewCount: b.reviewCount,
        deliveryEnabled: capabilityMaps.get(id)![BusinessCapabilityType.DELIVERY],
        pickupEnabled: capabilityMaps.get(id)![BusinessCapabilityType.PICKUP],
        deliveryFeeUsd: b.deliveryFeeUsd,
        deliveryEstimateMinutes: b.deliveryEstimateMinutes,
        offer: { title: primary.title, discountType: primary.discountType, discountValue: primary.discountValue },
        moreOffersCount: rest.length,
      };
    });
  }

  async create(businessId: string, dto: CreateBusinessCouponDto) {
    const hasCoupons = await this.capabilities.has(businessId, BusinessCapabilityType.COUPONS);
    if (!hasCoupons) {
      throw new BadRequestException(
        'This business does not have the COUPONS capability enabled — ask an admin to enable it first',
      );
    }
    // Coupon management is a paid membership benefit (both Plan Starter and Plan Pro include it) —
    // the capability flag above just says "coupons are switched on for this business", it was
    // never gated by whether that business actually pays BINGO+ for anything. A business with no
    // membership at all (e.g. a pure product-seller who never opted into the Directory) has no
    // plan to draw this benefit from, so it can't create coupons until it gets one.
    const membershipAllowsCoupons = await this.memberships.hasBenefit(businessId, 'coupons');
    if (!membershipAllowsCoupons) {
      throw new BadRequestException({
        error: {
          code: 'MEMBERSHIP_REQUIRED_FOR_COUPONS',
          message: 'Coupon management requires an active BINGO+ membership plan.',
        },
      });
    }
    return this.prisma.businessCoupon.create({
      data: {
        businessId,
        code: dto.code,
        title: dto.title,
        description: dto.description,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        minimumPurchase: dto.minimumPurchase,
        maximumDiscount: dto.maximumDiscount,
        startDate: new Date(dto.startDate),
        expirationDate: new Date(dto.expirationDate),
        usageLimit: dto.usageLimit,
        usagePerCustomer: dto.usagePerCustomer,
        termsAndConditions: dto.termsAndConditions,
        status: BusinessCouponStatus.DRAFT,
      },
    });
  }

  async update(businessId: string, couponId: string, dto: UpdateBusinessCouponDto) {
    await this.assertOwnedCoupon(businessId, couponId);
    const { startDate, expirationDate, ...rest } = dto;
    return this.prisma.businessCoupon.update({
      where: { id: couponId },
      data: {
        ...rest,
        startDate: startDate ? new Date(startDate) : undefined,
        expirationDate: expirationDate ? new Date(expirationDate) : undefined,
      },
    });
  }

  async setStatus(businessId: string, couponId: string, status: BusinessCouponStatus) {
    await this.assertOwnedCoupon(businessId, couponId);
    return this.prisma.businessCoupon.update({ where: { id: couponId }, data: { status } });
  }

  /** Customer-side: signs the token their app encodes as a QR. Never returns the discount amount. */
  async requestRedemptionToken(customerId: string, couponId: string) {
    const coupon = await this.prisma.businessCoupon.findUnique({ where: { id: couponId } });
    if (!coupon) throw new CouponNotFoundException();
    const now = new Date();
    if (coupon.status !== BusinessCouponStatus.ACTIVE) throw new CouponNotActiveException();
    if (now < coupon.startDate || now > coupon.expirationDate) throw new CouponExpiredException();

    const payload: RedemptionTokenPayload = { couponId, customerId };
    const token = this.jwt.sign(payload, {
      secret: this.config.getOrThrow('JWT_SECRET'),
      expiresIn: REDEMPTION_TOKEN_TTL_SECONDS,
    });
    return { token, expiresInSeconds: REDEMPTION_TOKEN_TTL_SECONDS, expiresAt: new Date(Date.now() + REDEMPTION_TOKEN_TTL_SECONDS * 1000) };
  }

  /** §42/43/44: same token as above, rendered as a downloadable QR image — never any extra payload. */
  async getQrImage(customerId: string, couponId: string) {
    const { token, expiresInSeconds, expiresAt } = await this.requestRedemptionToken(customerId, couponId);
    const qrCodeDataUrl = await QRCode.toDataURL(token, { errorCorrectionLevel: 'M', margin: 2, width: 320 });
    return { token, qrCodeDataUrl, expiresInSeconds, expiresAt };
  }

  /** Business-side dry run (§46) — same checks as redeem(), never writes a CouponRedemption. */
  async validate(businessId: string, token: string, opts: { purchaseAmount?: number }) {
    const payload = this.verifyToken(token);
    const coupon = await this.prisma.businessCoupon.findUnique({ where: { id: payload.couponId } });
    const now = new Date();
    this.assertRedeemable(coupon, businessId, now, opts.purchaseAmount);

    const totalRedemptions = await this.prisma.couponRedemption.count({ where: { couponId: coupon!.id } });
    if (coupon!.usageLimit !== null && totalRedemptions >= coupon!.usageLimit) throw new CouponUsageLimitReachedException();
    const customerRedemptions = await this.prisma.couponRedemption.count({
      where: { couponId: coupon!.id, customerId: payload.customerId },
    });
    if (coupon!.usagePerCustomer !== null && customerRedemptions >= coupon!.usagePerCustomer) {
      throw new CouponCustomerLimitReachedException();
    }

    return {
      valid: true,
      coupon: {
        id: coupon!.id,
        title: coupon!.title,
        discountType: coupon!.discountType,
        discountValue: coupon!.discountValue,
        maximumDiscount: coupon!.maximumDiscount,
      },
      estimatedDiscount: this.computeDiscount(coupon!, opts.purchaseAmount),
    };
  }

  /**
   * Business-side: scans the token and, inside one transaction, re-validates every rule before
   * writing the redemption. The coupon row is locked for the duration of the transaction
   * (`FOR UPDATE`) so two concurrent scans of the same QR — two employees, or the customer
   * showing it twice — can never both pass the usage-limit check before either commits (§47/69):
   * the second transaction blocks until the first finishes, then re-reads the now-current count.
   */
  async redeem(businessId: string, token: string, opts: { purchaseAmount?: number; petId?: string }) {
    const payload = this.verifyToken(token);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "BusinessCoupon" WHERE id = ${payload.couponId} FOR UPDATE`;

      const coupon = await tx.businessCoupon.findUnique({ where: { id: payload.couponId } });
      const now = new Date();
      this.assertRedeemable(coupon, businessId, now, opts.purchaseAmount);

      const totalRedemptions = await tx.couponRedemption.count({ where: { couponId: coupon!.id } });
      if (coupon!.usageLimit !== null && totalRedemptions >= coupon!.usageLimit) throw new CouponUsageLimitReachedException();
      const customerRedemptions = await tx.couponRedemption.count({
        where: { couponId: coupon!.id, customerId: payload.customerId },
      });
      if (coupon!.usagePerCustomer !== null && customerRedemptions >= coupon!.usagePerCustomer) {
        throw new CouponCustomerLimitReachedException();
      }

      return tx.couponRedemption.create({
        data: {
          couponId: coupon!.id,
          businessId,
          customerId: payload.customerId,
          petId: opts.petId,
          discountAmount: this.computeDiscount(coupon!, opts.purchaseAmount),
          purchaseAmount: opts.purchaseAmount,
        },
      });
    });
  }

  listRedemptionsForBusiness(businessId: string) {
    return this.prisma.couponRedemption.findMany({
      where: { businessId },
      include: { coupon: { select: { id: true, code: true, title: true } } },
      orderBy: { redeemedAt: 'desc' },
    });
  }

  async getRedemptionForBusiness(businessId: string, redemptionId: string) {
    const redemption = await this.prisma.couponRedemption.findUnique({
      where: { id: redemptionId },
      include: { coupon: { select: { id: true, code: true, title: true } } },
    });
    if (!redemption || redemption.businessId !== businessId) throw new NotFoundException('Redemption not found');
    return redemption;
  }

  private verifyToken(token: string): RedemptionTokenPayload {
    try {
      return this.jwt.verify<RedemptionTokenPayload>(token, { secret: this.config.getOrThrow('JWT_SECRET') });
    } catch {
      throw new CouponInvalidException();
    }
  }

  /** Shared by validate() and redeem() so a dry run and the real thing can never disagree. */
  private assertRedeemable(
    coupon: { businessId: string; status: BusinessCouponStatus; startDate: Date; expirationDate: Date; minimumPurchase: unknown } | null,
    businessId: string,
    now: Date,
    purchaseAmount?: number,
  ): asserts coupon {
    if (!coupon) throw new CouponNotFoundException();
    if (coupon.businessId !== businessId) throw new CouponWrongBusinessException();
    if (coupon.status !== BusinessCouponStatus.ACTIVE) throw new CouponNotActiveException();
    if (now < coupon.startDate || now > coupon.expirationDate) throw new CouponExpiredException();
    if (
      coupon.minimumPurchase !== null &&
      (purchaseAmount === undefined || purchaseAmount < Number(coupon.minimumPurchase))
    ) {
      throw new CouponMinimumPurchaseException(Number(coupon.minimumPurchase));
    }
  }

  private computeDiscount(
    coupon: { discountType: string; discountValue: unknown; maximumDiscount: unknown },
    purchaseAmount?: number,
  ): number {
    let discountAmount = Number(coupon.discountValue);
    if (coupon.discountType === 'PERCENTAGE' && purchaseAmount !== undefined) {
      discountAmount = (purchaseAmount * Number(coupon.discountValue)) / 100;
    }
    if (coupon.maximumDiscount !== null) {
      discountAmount = Math.min(discountAmount, Number(coupon.maximumDiscount));
    }
    return discountAmount;
  }

  private async assertOwnedCoupon(businessId: string, couponId: string) {
    const coupon = await this.prisma.businessCoupon.findUnique({ where: { id: couponId } });
    if (!coupon || coupon.businessId !== businessId) throw new NotFoundException('Coupon not found');
    return coupon;
  }
}
