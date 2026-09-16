import { FulfillmentType, Prisma, ProductTaxCategory } from '@prisma/client';
import { PriceCalculationService, PriceableCartItem } from './price-calculation.service';
import { PricingConfigService } from './pricing-config.service';
import { TaxCalculationService } from './tax-calculation.service';
import { DiscountService } from './discount.service';

describe('PriceCalculationService', () => {
  let service: PriceCalculationService;
  let pricingConfig: any;
  let tax: any;
  let discount: any;

  const items: PriceableCartItem[] = [
    {
      productId: 'p1',
      productName: 'Dog Food',
      sku: 'SKU-1',
      variantId: null,
      quantity: 2,
      unitPrice: new Prisma.Decimal(10),
      taxCategory: ProductTaxCategory.STANDARD,
    },
    {
      productId: 'p2',
      productName: 'Leash',
      sku: 'SKU-2',
      variantId: null,
      quantity: 1,
      unitPrice: new Prisma.Decimal(5),
      taxCategory: ProductTaxCategory.STANDARD,
    },
  ];

  beforeEach(() => {
    pricingConfig = {
      get: jest.fn().mockResolvedValue({
        platformFeePercent: 0,
        serviceFeePercent: 0,
        serviceFeeFixed: 0,
        defaultTaxPercent: 0,
        defaultDeliveryFee: 0,
      }),
    };
    tax = {
      calculate: jest.fn().mockReturnValue({
        taxableSubtotal: new Prisma.Decimal(0),
        zeroTaxSubtotal: new Prisma.Decimal(0),
        tax: new Prisma.Decimal(0),
      }),
    };
    discount = { calculate: jest.fn().mockReturnValue({ discountAmount: new Prisma.Decimal(0), appliedDiscounts: [] }) };
    service = new PriceCalculationService(
      pricingConfig as unknown as PricingConfigService,
      tax as unknown as TaxCalculationService,
      discount as unknown as DiscountService,
    );
  });

  it('computes subtotal from live unit prices × quantity, never a client-supplied total', async () => {
    const result = await service.calculate('b1', items, FulfillmentType.PICKUP, null);
    // 2*10 + 1*5 = 25
    expect(result.subtotal.toNumber()).toBe(25);
    expect(result.items[0].subtotal.toNumber()).toBe(20);
    expect(result.items[1].subtotal.toNumber()).toBe(5);
  });

  it('PICKUP never charges a delivery fee, even when the business has one configured', async () => {
    const result = await service.calculate('b1', items, FulfillmentType.PICKUP, new Prisma.Decimal(3.5));
    expect(result.deliveryFee.toNumber()).toBe(0);
  });

  it('DELIVERY uses the business-configured fee when present', async () => {
    const result = await service.calculate('b1', items, FulfillmentType.DELIVERY, new Prisma.Decimal(3.5));
    expect(result.deliveryFee.toNumber()).toBe(3.5);
  });

  it('DELIVERY falls back to the platform default fee when the business has none configured', async () => {
    pricingConfig.get.mockResolvedValue({
      platformFeePercent: 0,
      serviceFeePercent: 0,
      serviceFeeFixed: 0,
      defaultTaxPercent: 0,
      defaultDeliveryFee: 2,
    });
    const result = await service.calculate('b1', items, FulfillmentType.DELIVERY, null);
    expect(result.deliveryFee.toNumber()).toBe(2);
  });

  it('applies platformFee and serviceFee (percent + fixed) as configured, never hardcoded', async () => {
    pricingConfig.get.mockResolvedValue({
      platformFeePercent: 0.1,
      serviceFeePercent: 0.05,
      serviceFeeFixed: 1,
      defaultTaxPercent: 0,
      defaultDeliveryFee: 0,
    });
    const result = await service.calculate('b1', items, FulfillmentType.PICKUP, null);
    expect(result.platformFee.toNumber()).toBeCloseTo(2.5); // 10% of 25
    expect(result.serviceFee.toNumber()).toBeCloseTo(2.25); // 5% of 25 + 1
  });

  it('delegates the post-discount, per-category tax split to TaxCalculationService', async () => {
    discount.calculate.mockReturnValue({ discountAmount: new Prisma.Decimal(5), appliedDiscounts: [] });
    await service.calculate('b1', items, FulfillmentType.PICKUP, null);
    const [lineItemsArg, discountArg] = tax.calculate.mock.calls[0];
    expect(lineItemsArg).toHaveLength(2);
    expect(lineItemsArg[0].subtotal.toNumber()).toBe(20);
    expect((discountArg as Prisma.Decimal).toNumber()).toBe(5);
  });

  it("exposes TaxCalculationService's breakdown as taxableSubtotal/zeroTaxSubtotal/tax", async () => {
    tax.calculate.mockReturnValue({
      taxableSubtotal: new Prisma.Decimal(18),
      zeroTaxSubtotal: new Prisma.Decimal(7),
      tax: new Prisma.Decimal(2.7),
    });
    const result = await service.calculate('b1', items, FulfillmentType.PICKUP, null);
    expect(result.taxableSubtotal.toNumber()).toBe(18);
    expect(result.zeroTaxSubtotal.toNumber()).toBe(7);
    expect(result.tax.toNumber()).toBe(2.7);
  });

  it("computes each line's own taxAmount from its taxCategory, ZERO-rated lines charging nothing", async () => {
    pricingConfig.get.mockResolvedValue({
      platformFeePercent: 0,
      serviceFeePercent: 0,
      serviceFeeFixed: 0,
      defaultTaxPercent: 0.15,
      defaultDeliveryFee: 0,
    });
    const mixedItems: PriceableCartItem[] = [
      { ...items[0], taxCategory: ProductTaxCategory.STANDARD },
      { ...items[1], taxCategory: ProductTaxCategory.ZERO },
    ];
    const result = await service.calculate('b1', mixedItems, FulfillmentType.PICKUP, null);
    expect(result.items[0].taxAmount.toNumber()).toBeCloseTo(3); // 20 * 0.15
    expect(result.items[1].taxAmount.toNumber()).toBe(0);
  });

  it('total is exactly subtotal - discount + tax + platformFee + serviceFee + deliveryFee', async () => {
    discount.calculate.mockReturnValue({ discountAmount: new Prisma.Decimal(2), appliedDiscounts: [] });
    tax.calculate.mockReturnValue({
      taxableSubtotal: new Prisma.Decimal(23),
      zeroTaxSubtotal: new Prisma.Decimal(0),
      tax: new Prisma.Decimal(1.5),
    });
    pricingConfig.get.mockResolvedValue({
      platformFeePercent: 0,
      serviceFeePercent: 0,
      serviceFeeFixed: 0.5,
      defaultTaxPercent: 0,
      defaultDeliveryFee: 0,
    });
    const result = await service.calculate('b1', items, FulfillmentType.DELIVERY, new Prisma.Decimal(3));
    // 25 - 2 + 1.5 + 0 + 0.5 + 3 = 28
    expect(result.total.toNumber()).toBe(28);
  });

  it('never produces floating-point drift on repeating decimals (Decimal, not Number, arithmetic)', async () => {
    const oddItems: PriceableCartItem[] = [
      {
        productId: 'p1',
        productName: 'X',
        sku: null,
        variantId: null,
        quantity: 3,
        unitPrice: new Prisma.Decimal('10.1'),
        taxCategory: ProductTaxCategory.STANDARD,
      },
    ];
    const result = await service.calculate('b1', oddItems, FulfillmentType.PICKUP, null);
    expect(result.subtotal.toFixed(2)).toBe('30.30');
  });
});
