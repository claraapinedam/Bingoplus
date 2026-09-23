import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { BusinessStatus, ProductStatus } from '@prisma/client';
import { CartService } from './cart.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('CartService', () => {
  let service: CartService;
  let prisma: any;
  let capabilities: any;

  const activeProduct = {
    id: 'p1',
    businessId: 'biz-1',
    price: 10,
    salePrice: null,
    stock: 5,
    status: ProductStatus.ACTIVE,
    deletedAt: null,
    business: { status: BusinessStatus.ACTIVE, deletedAt: null },
  };

  beforeEach(() => {
    prisma = {
      product: { findUnique: jest.fn() },
      productVariant: { findUnique: jest.fn() },
      cart: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
      cartItem: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), findUnique: jest.fn() },
    };
    capabilities = { has: jest.fn().mockResolvedValue(true) };
    service = new CartService(prisma as unknown as PrismaService, capabilities);
  });

  describe('addItem', () => {
    it('rejects a product that is not active', async () => {
      prisma.product.findUnique.mockResolvedValue({ ...activeProduct, status: ProductStatus.INACTIVE });
      await expect(
        service.addItem('user-1', { productId: 'p1', quantity: 1 } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a product whose business is not ACTIVE', async () => {
      prisma.product.findUnique.mockResolvedValue({
        ...activeProduct,
        business: { status: BusinessStatus.PENDING, deletedAt: null },
      });
      await expect(
        service.addItem('user-1', { productId: 'p1', quantity: 1 } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a business that no longer has SELLS_PRODUCTS (RULE 4)', async () => {
      prisma.product.findUnique.mockResolvedValue(activeProduct);
      capabilities.has.mockResolvedValue(false);
      await expect(
        service.addItem('user-1', { productId: 'p1', quantity: 1 } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects adding more than the available stock', async () => {
      prisma.product.findUnique.mockResolvedValue(activeProduct);
      prisma.cart.findUnique.mockResolvedValue(null);
      prisma.cart.create.mockResolvedValue({ id: 'cart-1', userId: 'user-1', businessId: 'biz-1' });
      prisma.cartItem.findFirst.mockResolvedValue(null);
      await expect(
        service.addItem('user-1', { productId: 'p1', quantity: 999 } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('requires replaceCart to switch the cart to a different business', async () => {
      prisma.product.findUnique.mockResolvedValue(activeProduct);
      prisma.cart.findUnique.mockResolvedValue({ id: 'cart-1', userId: 'user-1', businessId: 'other-biz' });
      await expect(
        service.addItem('user-1', { productId: 'p1', quantity: 1 } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    // The connect/disconnect toggle — checked at add-to-cart time too, not just at checkout, same
    // reasoning as the SELLS_PRODUCTS check right above it in the service.
    describe('connect/disconnect toggle', () => {
      it('rejects a manually OFFLINE business even though it is ACTIVE and otherwise sellable', async () => {
        prisma.product.findUnique.mockResolvedValue({
          ...activeProduct,
          business: { status: BusinessStatus.ACTIVE, deletedAt: null, openingHours: null, manualOverride: 'OFFLINE' },
        });
        const err = await service
          .addItem('user-1', { productId: 'p1', quantity: 1 } as any)
          .catch((e: any) => e);
        expect(err).toBeInstanceOf(BadRequestException);
        expect(err.getResponse()).toMatchObject({ error: { code: 'BUSINESS_OFFLINE' } });
      });

      it('rejects when no override is set but the configured schedule says closed right now', async () => {
        const closedAllDay = { open: '00:00', close: '00:01' };
        prisma.product.findUnique.mockResolvedValue({
          ...activeProduct,
          business: {
            status: BusinessStatus.ACTIVE,
            deletedAt: null,
            manualOverride: null,
            openingHours: {
              sun: closedAllDay, mon: closedAllDay, tue: closedAllDay, wed: closedAllDay,
              thu: closedAllDay, fri: closedAllDay, sat: closedAllDay,
            },
          },
        });
        const err = await service
          .addItem('user-1', { productId: 'p1', quantity: 1 } as any)
          .catch((e: any) => e);
        expect(err).toBeInstanceOf(BadRequestException);
        expect(err.getResponse()).toMatchObject({ error: { code: 'BUSINESS_OFFLINE' } });
      });

      it('allows adding to cart when a manual ONLINE override is set, even outside configured hours', async () => {
        const closedAllDay = { open: '00:00', close: '00:01' };
        prisma.product.findUnique.mockResolvedValue({
          ...activeProduct,
          business: {
            status: BusinessStatus.ACTIVE,
            deletedAt: null,
            manualOverride: 'ONLINE',
            openingHours: {
              sun: closedAllDay, mon: closedAllDay, tue: closedAllDay, wed: closedAllDay,
              thu: closedAllDay, fri: closedAllDay, sat: closedAllDay,
            },
          },
        });
        prisma.cart.findUnique.mockResolvedValue(null);
        prisma.cart.create.mockResolvedValue({ id: 'cart-1', userId: 'user-1', businessId: 'biz-1' });
        prisma.cartItem.findFirst.mockResolvedValue(null);

        await expect(
          service.addItem('user-1', { productId: 'p1', quantity: 1 } as any),
        ).resolves.toBeDefined();
      });
    });
  });
});
