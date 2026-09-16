import { Injectable } from '@nestjs/common';
import { Prisma, ProductTaxCategory } from '@prisma/client';
import { PricingConfigValues } from './pricing-config.service';

export interface TaxableLineItem {
  subtotal: Prisma.Decimal;
  taxCategory: ProductTaxCategory;
}

export interface TaxBreakdown {
  /** Aka "subtotalIva" (Ecuador SRI/Kushki terms) — items taxed at the general rate. */
  taxableSubtotal: Prisma.Decimal;
  /** Aka "subtotalIva0" — items classified ProductTaxCategory.ZERO. */
  zeroTaxSubtotal: Prisma.Decimal;
  /** Aka "iva" — the tax actually charged. */
  tax: Prisma.Decimal;
}

/**
 * Per-product IVA classification (§9/38 extension), not a single flat rate on the order total:
 * each line's own ProductTaxCategory decides whether it's taxed at the general rate or at 0%. The
 * general rate itself still comes from PricingConfiguration.defaultTaxPercent — Ecuador's SRI has
 * changed it before (e.g. temporary reductions by presidential decree), so admins update one
 * config value instead of reclassifying the catalog every time. Kept as its own service so a real
 * Kushki integration can consume taxableSubtotal/zeroTaxSubtotal/tax directly as the
 * subtotalIva/subtotalIva0/iva fields its Ecuador card-payment API requires.
 */
@Injectable()
export class TaxCalculationService {
  calculate(items: TaxableLineItem[], discountAmount: Prisma.Decimal, config: PricingConfigValues): TaxBreakdown {
    let grossTaxable = new Prisma.Decimal(0);
    let grossZero = new Prisma.Decimal(0);
    for (const item of items) {
      if (item.taxCategory === ProductTaxCategory.ZERO) {
        grossZero = grossZero.plus(item.subtotal);
      } else {
        grossTaxable = grossTaxable.plus(item.subtotal);
      }
    }

    // Distribute any order-level discount proportionally across both buckets before taxing, so
    // tax is computed on the post-discount amount — same invariant as before per-category
    // splitting existed. DiscountService always returns 0 today, so this has no live effect yet;
    // it only matters once a real discount/promotion engine is built.
    const grossTotal = grossTaxable.plus(grossZero);
    const taxableShare = grossTotal.isZero() ? new Prisma.Decimal(0) : discountAmount.mul(grossTaxable).div(grossTotal);
    const zeroShare = discountAmount.minus(taxableShare);

    const taxableSubtotal = grossTaxable.minus(taxableShare);
    const zeroTaxSubtotal = grossZero.minus(zeroShare);

    return {
      taxableSubtotal,
      zeroTaxSubtotal,
      tax: taxableSubtotal.mul(config.defaultTaxPercent),
    };
  }
}
