import { Injectable } from '@nestjs/common';
import { FulfillmentType, Prisma, ProductTaxCategory } from '@prisma/client';
import { PricingConfigService } from './pricing-config.service';
import { TaxCalculationService } from './tax-calculation.service';
import { DiscountService } from './discount.service';

export interface PriceableCartItem {
  productId: string;
  productName: string;
  sku: string | null;
  variantId: string | null;
  quantity: number;
  /** Live price at calculation time — product.salePrice ?? product.price, plus variant.priceDelta. */
  unitPrice: Prisma.Decimal;
  /** Live Product.taxCategory at calculation time — decides this line's IVA rate. */
  taxCategory: ProductTaxCategory;
}

export interface PriceLineItem extends PriceableCartItem {
  subtotal: Prisma.Decimal;
  /** subtotal × this line's own tax rate (0 for ProductTaxCategory.ZERO). Not discount-prorated —
   * see TaxCalculationService for how the order-level `tax` total reconciles a discount. */
  taxAmount: Prisma.Decimal;
}

export interface PriceBreakdown {
  items: PriceLineItem[];
  subtotal: Prisma.Decimal;
  discount: Prisma.Decimal;
  /** Aka "subtotalIva" — see TaxCalculationService. */
  taxableSubtotal: Prisma.Decimal;
  /** Aka "subtotalIva0" — see TaxCalculationService. */
  zeroTaxSubtotal: Prisma.Decimal;
  tax: Prisma.Decimal;
  platformFee: Prisma.Decimal;
  serviceFee: Prisma.Decimal;
  deliveryFee: Prisma.Decimal;
  total: Prisma.Decimal;
  currency: string;
}

/**
 * The single source of truth for what a Marketplace order costs (§9). Always recomputes from
 * live product prices and the current PricingConfiguration — a client-supplied subtotal/total is
 * never trusted, here or anywhere downstream (§65).
 */
@Injectable()
export class PriceCalculationService {
  constructor(
    private readonly pricingConfig: PricingConfigService,
    private readonly tax: TaxCalculationService,
    private readonly discount: DiscountService,
  ) {}

  async calculate(
    businessId: string,
    items: PriceableCartItem[],
    fulfillmentType: FulfillmentType,
    businessDeliveryFee: Prisma.Decimal | null,
    currency = 'USD',
  ): Promise<PriceBreakdown> {
    const config = await this.pricingConfig.get();

    const lineItems: PriceLineItem[] = items.map((item) => {
      const subtotal = item.unitPrice.mul(item.quantity);
      const taxAmount =
        item.taxCategory === ProductTaxCategory.ZERO ? new Prisma.Decimal(0) : subtotal.mul(config.defaultTaxPercent);
      return { ...item, subtotal, taxAmount };
    });
    const subtotal = lineItems.reduce((sum, item) => sum.plus(item.subtotal), new Prisma.Decimal(0));

    const { discountAmount } = await this.discount.calculate(businessId, items, subtotal);
    const { taxableSubtotal, zeroTaxSubtotal, tax: taxAmount } = this.tax.calculate(lineItems, discountAmount, config);

    const platformFee = subtotal.mul(config.platformFeePercent);
    const serviceFee = subtotal.mul(config.serviceFeePercent).plus(config.serviceFeeFixed);
    const deliveryFee =
      fulfillmentType === FulfillmentType.DELIVERY
        ? (businessDeliveryFee ?? new Prisma.Decimal(config.defaultDeliveryFee))
        : new Prisma.Decimal(0);

    const total = subtotal.minus(discountAmount).plus(taxAmount).plus(platformFee).plus(serviceFee).plus(deliveryFee);

    return {
      items: lineItems,
      subtotal,
      discount: discountAmount,
      taxableSubtotal,
      zeroTaxSubtotal,
      tax: taxAmount,
      platformFee,
      serviceFee,
      deliveryFee,
      total,
      currency,
    };
  }
}
