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
  });
});
