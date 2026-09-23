import { BadRequestException } from '@nestjs/common';
import { BusinessStatus, FulfillmentType, ProductTaxCategory } from '@prisma/client';
import { CheckoutService } from './checkout.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * The connect/disconnect toggle re-checked at checkout time (loadAndValidateCheckoutInputs, shared
 * by validate() and the real createPayment() transaction) — same effective-status computation as
 * CartService's own gate, tested here against validate() since it never mutates anything, making it
 * the cheapest path to exercise the shared validation without standing up the whole payment
 * pipeline (PriceCalculationService/StockService/PaymentService/etc., mocked out below and unused
 * by the rejection paths since the gate throws before any of them are touched).
 */
describe('CheckoutService — online/offline gate (loadAndValidateCheckoutInputs)', () => {
  let service: CheckoutService;
  let prisma: any;
  let capabilities: any;
  let priceCalculation: any;

  const closedAllDay = { open: '00:00', close: '00:01' };
  const alwaysClosedHours = {
    sun: closedAllDay, mon: closedAllDay, tue: closedAllDay, wed: closedAllDay,
    thu: closedAllDay, fri: closedAllDay, sat: closedAllDay,
  };

  function cartWithBusiness(business: Record<string, unknown>) {
    return {
      id: 'cart-1',
      items: [
        {
          productId: 'p1',
          variantId: null,
          quantity: 1,
          product: {
            id: 'p1',
            name: 'Producto',
            sku: 'SKU1',
            deletedAt: null,
            status: 'ACTIVE',
            price: 10,
            salePrice: null,
            taxCategory: ProductTaxCategory.STANDARD,
            business: {
              id: 'biz-1',
              status: BusinessStatus.ACTIVE,
              deletedAt: null,
              latitude: null,
              longitude: null,
              timezone: 'America/Guayaquil',
              membership: { status: 'ACTIVE' },
              ...business,
            },
          },
          variant: null,
        },
      ],
    };
  }

  const decimalLike = (n: number) => ({ toNumber: () => n });

  beforeEach(() => {
    prisma = { cart: { findUnique: jest.fn() }, address: { findUnique: jest.fn() } };
    capabilities = { getMap: jest.fn().mockResolvedValue({ SELLS_PRODUCTS: true, PICKUP: true, DELIVERY: true }) };
    priceCalculation = { calculate: jest.fn() };
    service = new CheckoutService(
      prisma as unknown as PrismaService,
      capabilities,
      priceCalculation,
      {} as any, // stock — unused by validate()'s gate/pricing path
      {} as any, // payments
      {} as any, // stateMachine
      { get: jest.fn().mockReturnValue('USD') } as any, // config
      {} as any, // notifications
      {} as any, // businessNotificationGateway
    );
  });

  it('rejects with BUSINESS_OFFLINE when the business is manually OFFLINE, even though ACTIVE', async () => {
    prisma.cart.findUnique.mockResolvedValue(cartWithBusiness({ openingHours: null, manualOverride: 'OFFLINE' }));

    const err = await service
      .validate('user-1', { fulfillmentType: FulfillmentType.PICKUP } as any)
      .catch((e: any) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({ error: { code: 'BUSINESS_OFFLINE' } });
    expect(priceCalculation.calculate).not.toHaveBeenCalled();
  });

  it('rejects with BUSINESS_OFFLINE when no override is set but the schedule says closed right now', async () => {
    prisma.cart.findUnique.mockResolvedValue(cartWithBusiness({ openingHours: alwaysClosedHours, manualOverride: null }));

    const err = await service
      .validate('user-1', { fulfillmentType: FulfillmentType.PICKUP } as any)
      .catch((e: any) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({ error: { code: 'BUSINESS_OFFLINE' } });
  });

  it('still rejects with the pre-existing BUSINESS_NOT_ACTIVE code when the business is not ACTIVE at all — takes priority over the online/offline gate', async () => {
    prisma.cart.findUnique.mockResolvedValue(cartWithBusiness({ status: BusinessStatus.SUSPENDED, openingHours: null, manualOverride: 'ONLINE' }));

    const err = await service
      .validate('user-1', { fulfillmentType: FulfillmentType.PICKUP } as any)
      .catch((e: any) => e);

    expect(err.getResponse()).toMatchObject({ error: { code: 'BUSINESS_NOT_ACTIVE' } });
  });

  it('proceeds past the gate (reaches price calculation) when a manual ONLINE override is set, even outside configured hours', async () => {
    prisma.cart.findUnique.mockResolvedValue(cartWithBusiness({ openingHours: alwaysClosedHours, manualOverride: 'ONLINE' }));
    priceCalculation.calculate.mockResolvedValue({
      items: [],
      subtotal: decimalLike(10),
      discount: decimalLike(0),
      taxableSubtotal: decimalLike(10),
      zeroTaxSubtotal: decimalLike(0),
      tax: decimalLike(1.2),
      serviceFee: decimalLike(0),
      deliveryFee: decimalLike(0),
      total: decimalLike(11.2),
      currency: 'USD',
    });

    const result = await service.validate('user-1', { fulfillmentType: FulfillmentType.PICKUP } as any);

    expect(result.valid).toBe(true);
    expect(priceCalculation.calculate).toHaveBeenCalled();
  });
});
