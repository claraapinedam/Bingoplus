import { Prisma, ProductTaxCategory } from '@prisma/client';
import { TaxCalculationService, TaxableLineItem } from './tax-calculation.service';
import { PricingConfigValues } from './pricing-config.service';

describe('TaxCalculationService', () => {
  let service: TaxCalculationService;

  const config: PricingConfigValues = {
    serviceFeePercent: 0,
    serviceFeeFixed: 0,
    defaultTaxPercent: 0.15,
  };

  beforeEach(() => {
    service = new TaxCalculationService();
  });

  it('taxes STANDARD lines at the configured rate and ZERO lines at nothing', () => {
    const items: TaxableLineItem[] = [
      { subtotal: new Prisma.Decimal(20), taxCategory: ProductTaxCategory.STANDARD },
      { subtotal: new Prisma.Decimal(10), taxCategory: ProductTaxCategory.ZERO },
    ];
    const result = service.calculate(items, new Prisma.Decimal(0), config);
    expect(result.taxableSubtotal.toNumber()).toBe(20);
    expect(result.zeroTaxSubtotal.toNumber()).toBe(10);
    expect(result.tax.toNumber()).toBeCloseTo(3); // 20 * 0.15
  });

  it('an all-zero-rated cart charges no tax regardless of the general rate', () => {
    const items: TaxableLineItem[] = [{ subtotal: new Prisma.Decimal(50), taxCategory: ProductTaxCategory.ZERO }];
    const result = service.calculate(items, new Prisma.Decimal(0), config);
    expect(result.tax.toNumber()).toBe(0);
    expect(result.zeroTaxSubtotal.toNumber()).toBe(50);
  });

  it('a rate change in PricingConfiguration alone moves the tax, with no catalog change', () => {
    const items: TaxableLineItem[] = [{ subtotal: new Prisma.Decimal(100), taxCategory: ProductTaxCategory.STANDARD }];
    const reducedRateConfig = { ...config, defaultTaxPercent: 0.08 }; // e.g. a temporary decree
    const result = service.calculate(items, new Prisma.Decimal(0), reducedRateConfig);
    expect(result.tax.toNumber()).toBeCloseTo(8);
  });

  it('distributes a discount proportionally across both buckets before taxing', () => {
    const items: TaxableLineItem[] = [
      { subtotal: new Prisma.Decimal(80), taxCategory: ProductTaxCategory.STANDARD },
      { subtotal: new Prisma.Decimal(20), taxCategory: ProductTaxCategory.ZERO },
    ];
    // 100 total, 10 discount -> 80% of it (8) comes off the taxable bucket, 20% (2) off zero-rated
    const result = service.calculate(items, new Prisma.Decimal(10), config);
    expect(result.taxableSubtotal.toNumber()).toBeCloseTo(72);
    expect(result.zeroTaxSubtotal.toNumber()).toBeCloseTo(18);
    expect(result.tax.toNumber()).toBeCloseTo(10.8); // 72 * 0.15
  });

  it('does not divide by zero when the cart is empty', () => {
    const result = service.calculate([], new Prisma.Decimal(0), config);
    expect(result.taxableSubtotal.toNumber()).toBe(0);
    expect(result.zeroTaxSubtotal.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(0);
  });
});
