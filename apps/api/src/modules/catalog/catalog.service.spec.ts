import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('CatalogService', () => {
  let service: CatalogService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      productCategory: { findUnique: jest.fn() },
      product: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      inventoryMovement: { create: jest.fn() },
      $transaction: jest.fn((ops: any[]) => Promise.all(ops.map((o) => (typeof o === 'function' ? o() : o)))),
    };
    service = new CatalogService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('rejects an unknown category slug', async () => {
      prisma.productCategory.findUnique.mockResolvedValue(null);
      await expect(
        service.create('biz-1', {
          name: 'Test',
          categorySlug: 'no-such-category',
          price: 10,
          stock: 5,
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a salePrice that is not lower than price', async () => {
      prisma.productCategory.findUnique.mockResolvedValue({ id: 'cat-1' });
      await expect(
        service.create('biz-1', {
          name: 'Test',
          categorySlug: 'alimento',
          price: 10,
          salePrice: 10,
          stock: 5,
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('updateStock', () => {
    it('refuses to let stock go negative', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        businessId: 'biz-1',
        stock: 5,
        deletedAt: null,
      });
      await expect(
        service.updateStock('biz-1', 'p1', { quantityChange: -10, reason: 'SALE' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException when the product belongs to a different business', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        businessId: 'other-biz',
        stock: 5,
        deletedAt: null,
      });
      await expect(
        service.updateStock('biz-1', 'p1', { quantityChange: 1, reason: 'RESTOCK' } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('admin — global product visibility (§15), never a second Product management surface', () => {
    it('listForAdmin sees products across every business, not just one', async () => {
      prisma.product.count.mockResolvedValue(1);
      prisma.product.findMany.mockResolvedValue([
        { id: 'p1', stock: 10, species: [], category: { name: 'Cat' }, business: { id: 'b1', tradeName: 'Biz' } },
      ]);
      const result = await service.listForAdmin({});
      expect(result.data).toHaveLength(1);
      expect(result.data[0].lowStock).toBe(false);
    });

    it('listForAdmin can narrow to one business', async () => {
      await service.listForAdmin({ businessId: 'b1' });
      expect(prisma.product.findMany.mock.calls[0][0].where).toMatchObject({ businessId: 'b1' });
    });

    it('getForAdmin 404s on an unknown product', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(service.getForAdmin('ghost')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('getForAdmin flags lowStock the same way the business-facing view does', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        stock: 2,
        species: [],
        category: { name: 'Cat' },
        business: { id: 'b1', tradeName: 'Biz' },
        variants: [],
      });
      const result = await service.getForAdmin('p1');
      expect(result.lowStock).toBe(true);
    });
  });
});
