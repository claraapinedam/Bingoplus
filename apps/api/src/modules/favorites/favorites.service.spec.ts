import { BusinessStatus, FavoriteTargetType } from '@prisma/client';
import { FavoritesService } from './favorites.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessCapabilitiesService } from '../business-capabilities/business-capabilities.service';

describe('FavoritesService', () => {
  let service: FavoritesService;
  let prisma: any;
  let capabilities: any;

  beforeEach(() => {
    prisma = {
      favorite: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), delete: jest.fn() },
      business: { findMany: jest.fn() },
      businessCoupon: { findMany: jest.fn().mockResolvedValue([]) },
    };
    capabilities = { getMapForMany: jest.fn() };
    service = new FavoritesService(
      prisma as unknown as PrismaService,
      capabilities as unknown as BusinessCapabilitiesService,
    );
  });

  describe('toggle', () => {
    it('favorites a target that was not favorited yet', async () => {
      prisma.favorite.findUnique.mockResolvedValue(null);
      const result = await service.toggle('u1', FavoriteTargetType.BUSINESS, 'b1');
      expect(result).toEqual({ favorited: true });
      expect(prisma.favorite.create).toHaveBeenCalledWith({
        data: { userId: 'u1', targetType: FavoriteTargetType.BUSINESS, targetId: 'b1' },
      });
    });

    it('un-favorites a target that was already favorited', async () => {
      prisma.favorite.findUnique.mockResolvedValue({ id: 'fav-1' });
      const result = await service.toggle('u1', FavoriteTargetType.BUSINESS, 'b1');
      expect(result).toEqual({ favorited: false });
      expect(prisma.favorite.delete).toHaveBeenCalledWith({ where: { id: 'fav-1' } });
      expect(prisma.favorite.create).not.toHaveBeenCalled();
    });
  });

  describe('listFavoriteBusinesses', () => {
    it('returns an empty list without querying businesses when there are no favorites', async () => {
      prisma.favorite.findMany.mockResolvedValue([]);
      const result = await service.listFavoriteBusinesses('u1');
      expect(result).toEqual([]);
      expect(prisma.business.findMany).not.toHaveBeenCalled();
    });

    it('silently drops a favorited business that is no longer ACTIVE, never shows a broken card', async () => {
      prisma.favorite.findMany.mockResolvedValue([
        { targetId: 'b1', createdAt: new Date('2026-01-02') },
        { targetId: 'b2', createdAt: new Date('2026-01-01') },
      ]);
      // b2 was suspended after being favorited — the ACTIVE-only where clause drops it, so the
      // mock here only returns b1 to simulate that.
      prisma.business.findMany.mockResolvedValue([
        {
          id: 'b1',
          tradeName: 'Pet World',
          logoUrl: null,
          city: 'Quito',
          categories: [{ category: { id: 'c1', name: 'Tiendas', slug: 'tiendas' } }],
          ratingAvg: 4.5,
          reviewCount: 10,
        },
      ]);
      capabilities.getMapForMany.mockResolvedValue(
        new Map([['b1', { DELIVERY: true, PICKUP: false }]]),
      );

      const result = await service.listFavoriteBusinesses('u1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('b1');
      expect(result[0].deliveryEnabled).toBe(true);
      const whereArg = prisma.business.findMany.mock.calls[0][0].where;
      expect(whereArg.status).toBe(BusinessStatus.ACTIVE);
    });

    it('orders results by favorited-at, most recent first', async () => {
      prisma.favorite.findMany.mockResolvedValue([
        { targetId: 'newer', createdAt: new Date('2026-02-01') },
        { targetId: 'older', createdAt: new Date('2026-01-01') },
      ]);
      prisma.business.findMany.mockResolvedValue([
        { id: 'older', tradeName: 'Older', logoUrl: null, city: 'Quito', categories: [{ category: { id: 'c', name: 'X', slug: 'x' } }], ratingAvg: 4, reviewCount: 1 },
        { id: 'newer', tradeName: 'Newer', logoUrl: null, city: 'Quito', categories: [{ category: { id: 'c', name: 'X', slug: 'x' } }], ratingAvg: 4, reviewCount: 1 },
      ]);
      capabilities.getMapForMany.mockResolvedValue(
        new Map([
          ['older', { DELIVERY: false, PICKUP: false }],
          ['newer', { DELIVERY: false, PICKUP: false }],
        ]),
      );

      const result = await service.listFavoriteBusinesses('u1');

      expect(result.map((b) => b.id)).toEqual(['newer', 'older']);
    });
  });
});
