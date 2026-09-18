import { FulfillmentType, Prisma, ProductTaxCategory } from '@prisma/client';
import { PriceCalculationService, PriceableCartItem, DeliveryFareContext } from './price-calculation.service';
import { PricingConfigService } from './pricing-config.service';
import { TaxCalculationService } from './tax-calculation.service';
import { DiscountService } from './discount.service';
import { DeliveryFareCalculationService } from '../delivery/delivery-fare-calculation.service';

const SOME_DELIVERY_CONTEXT: DeliveryFareContext = {
  pickup: { latitude: -0.18, longitude: -78.47 },
  dropoff: { latitude: -0.19, longitude: -78.48 },
  timezone: 'America/Guayaquil',
};

describe('PriceCalculationService', () => {
  let service: PriceCalculationService;
  let pricingConfig: any;
  let tax: any;
  let discount: any;
  let deliveryFare: any;

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
        serviceFeePercent: 0,
        serviceFeeFixed: 0,
        defaultTaxPercent: 0,
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
    deliveryFare = {
      calculate: jest.fn().mockResolvedValue({ fee: 3.5, distanceKm: 2, durationMinutes: 10, isNight: false, surgeApplied: false, surgeMultiplier: 1 }),
    };
    service = new PriceCalculationService(
      pricingConfig as unknown as PricingConfigService,
      tax as unknown as TaxCalculationService,
      discount as unknown as DiscountService,
      deliveryFare as unknown as DeliveryFareCalculationService,
    );
  });

  it('computes subtotal from live unit prices × quantity, never a client-supplied total', async () => {
    const result = await service.calculate('b1', items, FulfillmentType.PICKUP, null);
    // 2*10 + 1*5 = 25
    expect(result.subtotal.toNumber()).toBe(25);
    expect(result.items[0].subtotal.toNumber()).toBe(20);
    expect(result.items[1].subtotal.toNumber()).toBe(5);
  });

  it('PICKUP never charges a delivery fee and never calls the fare engine at all', async () => {
    const result = await service.calculate('b1', items, FulfillmentType.PICKUP, SOME_DELIVERY_CONTEXT);
    expect(result.deliveryFee.toNumber()).toBe(0);
    expect(deliveryFare.calculate).not.toHaveBeenCalled();
  });

  it('DELIVERY quotes the fee from DeliveryFareCalculationService, not a business-set flat fee', async () => {
    const result = await service.calculate('b1', items, FulfillmentType.DELIVERY, SOME_DELIVERY_CONTEXT);
    expect(deliveryFare.calculate).toHaveBeenCalledWith(
      SOME_DELIVERY_CONTEXT.pickup,
      SOME_DELIVERY_CONTEXT.dropoff,
      SOME_DELIVERY_CONTEXT.timezone,
    );
    expect(result.deliveryFee.toNumber()).toBe(3.5);
  });

  it('DELIVERY with no context (coordinates unresolved) still charges nothing extra without calling the fare engine', async () => {
    const result = await service.calculate('b1', items, FulfillmentType.DELIVERY, null);
    expect(result.deliveryFee.toNumber()).toBe(0);
    expect(deliveryFare.calculate).not.toHaveBeenCalled();
  });

  it('applies serviceFee (percent + fixed) as configured, never hardcoded, and never a platform commission line', async () => {
    pricingConfig.get.mockResolvedValue({
      serviceFeePercent: 0.05,
      serviceFeeFixed: 1,
      defaultTaxPercent: 0,
    });
    const result = await service.calculate('b1', items, FulfillmentType.PICKUP, null);
    expect(result.serviceFee.toNumber()).toBeCloseTo(2.25); // 5% of 25 + 1
    expect('platformFee' in result).toBe(false);
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
      serviceFeePercent: 0,
      serviceFeeFixed: 0,
      defaultTaxPercent: 0.15,
    });
    const mixedItems: PriceableCartItem[] = [
      { ...items[0], taxCategory: ProductTaxCategory.STANDARD },
      { ...items[1], taxCategory: ProductTaxCategory.ZERO },
    ];
    const result = await service.calculate('b1', mixedItems, FulfillmentType.PICKUP, null);
    expect(result.items[0].taxAmount.toNumber()).toBeCloseTo(3); // 20 * 0.15
    expect(result.items[1].taxAmount.toNumber()).toBe(0);
  });

  it('total is exactly subtotal - discount + tax + serviceFee + deliveryFee', async () => {
    discount.calculate.mockReturnValue({ discountAmount: new Prisma.Decimal(2), appliedDiscounts: [] });
    tax.calculate.mockReturnValue({
      taxableSubtotal: new Prisma.Decimal(23),
      zeroTaxSubtotal: new Prisma.Decimal(0),
      tax: new Prisma.Decimal(1.5),
    });
    pricingConfig.get.mockResolvedValue({
      serviceFeePercent: 0,
      serviceFeeFixed: 0.5,
      defaultTaxPercent: 0,
    });
    const result = await service.calculate('b1', items, FulfillmentType.DELIVERY, SOME_DELIVERY_CONTEXT);
    // 25 - 2 + 1.5 + 0.5 + 3.5 = 28.5
    expect(result.total.toNumber()).toBe(28.5);
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
