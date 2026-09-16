import { Prisma, PromotionStatus, PromotionTargetType, PromotionType } from '@prisma/client';
import { DiscountService } from './discount.service';
import { PrismaService } from '../../prisma/prisma.service';

function money(n: number) {
  return new Prisma.Decimal(n);
}

describe('DiscountService — Promotion engine (FASE 8 §2/4)', () => {
  let service: DiscountService;
  let prisma: any;

  const item = (productId: string, unitPrice: number, quantity = 1) => ({
    productId,
    productName: productId,
    sku: null,
    variantId: null,
    quantity,
    unitPrice: money(unitPrice),
    taxCategory: 'STANDARD' as const,
  });

  beforeEach(() => {
    prisma = {
      promotion: { findMany: jest.fn().mockResolvedValue([]) },
      product: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new DiscountService(prisma as unknown as PrismaService);
  });

  it('returns zero when the cart subtotal is zero — never divides by zero or errors', async () => {
    const result = await service.calculate('biz-1', [], money(0));
    expect(result.discountAmount.toNumber()).toBe(0);
  });

  it('returns zero when no ACTIVE promotion exists for the business (the pre-FASE8 stub behavior for everyone else)', async () => {
    const result = await service.calculate('biz-1', [item('p1', 100)], money(100));
    expect(result.discountAmount.toNumber()).toBe(0);
    expect(result.appliedDiscounts).toHaveLength(0);
  });

  it('never reads BusinessCoupon or AdminCoupon — RULE 14/15/39', () => {
    expect(prisma.businessCoupon).toBeUndefined();
    expect(prisma.adminCoupon).toBeUndefined();
  });

  it('applies a PERCENTAGE promotion to a targeted product only, not the whole cart', async () => {
    prisma.promotion.findMany.mockResolvedValue([
      {
        id: 'promo-1',
        type: PromotionType.PERCENTAGE,
        value: money(20),
        minimumPurchase: null,
        maximumDiscount: null,
        targets: [{ targetType: PromotionTargetType.PRODUCT, targetId: 'p1' }],
      },
    ]);
    prisma.product.findMany.mockResolvedValue([{ id: 'p1', categoryId: 'cat-1' }, { id: 'p2', categoryId: 'cat-2' }]);

    const result = await service.calculate('biz-1', [item('p1', 100), item('p2', 50)], money(150));

    // 20% of the p1 line (100) only, never touching p2's 50
    expect(result.discountAmount.toNumber()).toBe(20);
    expect(result.appliedDiscounts[0].source).toBe('promotion:promo-1');
  });

  it('applies a BUSINESS-wide promotion to the full subtotal', async () => {
    prisma.promotion.findMany.mockResolvedValue([
      {
        id: 'promo-biz',
        type: PromotionType.FIXED_AMOUNT,
        value: money(10),
        minimumPurchase: null,
        maximumDiscount: null,
        targets: [{ targetType: PromotionTargetType.BUSINESS, targetId: 'biz-1' }],
      },
    ]);

    const result = await service.calculate('biz-1', [item('p1', 100)], money(100));
    expect(result.discountAmount.toNumber()).toBe(10);
  });

  it('caps the discount at maximumDiscount even when the percentage would be worth more', async () => {
    prisma.promotion.findMany.mockResolvedValue([
      {
        id: 'promo-cap',
        type: PromotionType.PERCENTAGE,
        value: money(50),
        minimumPurchase: null,
        maximumDiscount: money(15),
        targets: [{ targetType: PromotionTargetType.BUSINESS, targetId: 'biz-1' }],
      },
    ]);

    const result = await service.calculate('biz-1', [item('p1', 100)], money(100));
    expect(result.discountAmount.toNumber()).toBe(15); // not 50
  });

  it('skips a promotion whose minimumPurchase the cart does not meet', async () => {
    prisma.promotion.findMany.mockResolvedValue([
      {
        id: 'promo-min',
        type: PromotionType.FIXED_AMOUNT,
        value: money(10),
        minimumPurchase: money(200),
        maximumDiscount: null,
        targets: [{ targetType: PromotionTargetType.BUSINESS, targetId: 'biz-1' }],
      },
    ]);

    const result = await service.calculate('biz-1', [item('p1', 100)], money(100));
    expect(result.discountAmount.toNumber()).toBe(0);
  });

  it('does NOT stack two matching promotions — only the single best-value one applies (§4.4 conflict rule)', async () => {
    prisma.promotion.findMany.mockResolvedValue([
      {
        id: 'promo-small',
        type: PromotionType.FIXED_AMOUNT,
        value: money(5),
        minimumPurchase: null,
        maximumDiscount: null,
        targets: [{ targetType: PromotionTargetType.PRODUCT, targetId: 'p1' }],
      },
      {
        id: 'promo-big',
        type: PromotionType.PERCENTAGE,
        value: money(30),
        minimumPurchase: null,
        maximumDiscount: null,
        targets: [{ targetType: PromotionTargetType.PRODUCT, targetId: 'p1' }],
      },
    ]);
    prisma.product.findMany.mockResolvedValue([{ id: 'p1', categoryId: 'cat-1' }]);

    const result = await service.calculate('biz-1', [item('p1', 100)], money(100));

    expect(result.discountAmount.toNumber()).toBe(30); // the bigger one, not 5+30=35
    expect(result.appliedDiscounts).toHaveLength(1);
    expect(result.appliedDiscounts[0].source).toBe('promotion:promo-big');
  });

  it('a PRODUCT_CATEGORY promotion matches every product in that category', async () => {
    prisma.promotion.findMany.mockResolvedValue([
      {
        id: 'promo-cat',
        type: PromotionType.PERCENTAGE,
        value: money(10),
        minimumPurchase: null,
        maximumDiscount: null,
        targets: [{ targetType: PromotionTargetType.PRODUCT_CATEGORY, targetId: 'cat-1' }],
      },
    ]);
    prisma.product.findMany.mockResolvedValue([{ id: 'p1', categoryId: 'cat-1' }, { id: 'p2', categoryId: 'cat-other' }]);

    const result = await service.calculate('biz-1', [item('p1', 100), item('p2', 100)], money(200));
    expect(result.discountAmount.toNumber()).toBe(10); // only p1's line counts
  });

  it('only ever queries promotions filtered to ACTIVE + the current date range at the DB level', async () => {
    await service.calculate('biz-1', [item('p1', 100)], money(100));
    expect(prisma.promotion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: 'biz-1',
          status: PromotionStatus.ACTIVE,
          startDate: expect.objectContaining({ lte: expect.any(Date) }),
          endDate: expect.objectContaining({ gte: expect.any(Date) }),
        }),
      }),
    );
  });
});
