import { Injectable } from '@nestjs/common';
import { Prisma, PromotionStatus, PromotionTargetType, PromotionType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PriceableCartItem } from './price-calculation.service';

export interface DiscountResult {
  discountAmount: Prisma.Decimal;
  appliedDiscounts: { source: string; amount: Prisma.Decimal }[];
}

/**
 * §39/FASE8 §2: Marketplace-native discounts — Promotion is the only thing this ever reads; it
 * deliberately never reads BusinessCoupon (Directory) or AdminCoupon (Membership) — those are
 * different financial domains and must never auto-apply at checkout (RULE 3/4/14/15).
 *
 * Conflict rule (FASE 8 §4.4, kept deliberately simple per that section's own "no reglas
 * excesivamente complejas" instruction): Promotions do not stack with each other. Every currently
 * ACTIVE, in-date-range, minimum-purchase-eligible Promotion for this business is evaluated
 * independently against the cart, and only the single one that yields the largest discount is
 * applied. A BUSINESS-wide promotion competes against PRODUCT/PRODUCT_CATEGORY ones on equal
 * footing — whichever is worth more to the customer wins, never both.
 */
@Injectable()
export class DiscountService {
  constructor(private readonly prisma: PrismaService) {}

  async calculate(businessId: string, items: PriceableCartItem[], subtotal: Prisma.Decimal): Promise<DiscountResult> {
    if (subtotal.isZero()) return { discountAmount: new Prisma.Decimal(0), appliedDiscounts: [] };

    const now = new Date();
    const promotions = await this.prisma.promotion.findMany({
      where: { businessId, status: PromotionStatus.ACTIVE, startDate: { lte: now }, endDate: { gte: now } },
      include: { targets: true },
    });
    if (promotions.length === 0) return { discountAmount: new Prisma.Decimal(0), appliedDiscounts: [] };

    const productIds = items.map((i) => i.productId);
    const products =
      productIds.length > 0
        ? await this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, categoryId: true } })
        : [];
    const categoryByProduct = new Map(products.map((p) => [p.id, p.categoryId]));

    let best: { promotionId: string; amount: Prisma.Decimal } | null = null;

    for (const promo of promotions) {
      if (promo.minimumPurchase && subtotal.lessThan(promo.minimumPurchase)) continue;

      const isBusinessWide = promo.targets.some((t) => t.targetType === PromotionTargetType.BUSINESS);
      let applicableSubtotal = new Prisma.Decimal(0);
      if (isBusinessWide) {
        applicableSubtotal = subtotal;
      } else {
        for (const item of items) {
          const matches = promo.targets.some(
            (t) =>
              (t.targetType === PromotionTargetType.PRODUCT && t.targetId === item.productId) ||
              (t.targetType === PromotionTargetType.PRODUCT_CATEGORY && t.targetId === categoryByProduct.get(item.productId)),
          );
          if (matches) applicableSubtotal = applicableSubtotal.plus(item.unitPrice.mul(item.quantity));
        }
      }
      if (applicableSubtotal.isZero()) continue;

      let amount =
        promo.type === PromotionType.PERCENTAGE
          ? applicableSubtotal.mul(promo.value).div(100)
          : new Prisma.Decimal(promo.value);
      if (promo.maximumDiscount && amount.greaterThan(promo.maximumDiscount)) amount = new Prisma.Decimal(promo.maximumDiscount);
      if (amount.greaterThan(applicableSubtotal)) amount = applicableSubtotal;

      if (!best || amount.greaterThan(best.amount)) best = { promotionId: promo.id, amount };
    }

    if (!best) return { discountAmount: new Prisma.Decimal(0), appliedDiscounts: [] };
    return { discountAmount: best.amount, appliedDiscounts: [{ source: `promotion:${best.promotionId}`, amount: best.amount }] };
  }
}
