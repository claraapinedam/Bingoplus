import { BusinessStatus } from '@prisma/client';
import { DirectoryService } from './directory.service';
import { PrismaService } from '../../prisma/prisma.service';

function makeBusiness(overrides: Partial<any> = {}) {
  return {
    id: 'b1',
    tradeName: 'Test',
    logoUrl: null,
    coverImageUrl: null,
    city: 'Quito',
    latitude: null,
    longitude: null,
    openingHours: null,
    ratingAvg: 4,
    reviewCount: 10,
    category: { id: 'c1', name: 'Veterinarios', slug: 'veterinarios', icon: null },
    membership: { plan: { benefits: {} } },
    ...overrides,
  };
}

describe('DirectoryService', () => {
  let service: DirectoryService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      businessCategory: { findUnique: jest.fn() },
      business: { findMany: jest.fn().mockResolvedValue([]) },
      businessCoupon: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new DirectoryService(prisma as unknown as PrismaService);
  });

  it('excludes "tiendas" and "delivery" categories at the query level — the same partition the apply form uses', async () => {
    await service.list({});
    const where = prisma.business.findMany.mock.calls[0][0].where;
    expect(where.category).toEqual({ slug: { notIn: ['tiendas', 'delivery'] } });
    expect(where.status).toBe(BusinessStatus.ACTIVE);
  });

  it('sorts a "featured" (Plan Pro) business ahead of a farther/better-rated non-featured one', async () => {
    prisma.business.findMany.mockResolvedValue([
      makeBusiness({ id: 'not-featured', ratingAvg: 5, membership: { plan: { benefits: { featured: false } } } }),
      makeBusiness({ id: 'featured', ratingAvg: 3, membership: { plan: { benefits: { featured: true } } } }),
    ]);

    const result = await service.list({});

    expect(result[0].id).toBe('featured');
    expect(result[0].featured).toBe(true);
    expect(result[1].id).toBe('not-featured');
  });

  it('falls back to distance/rating order within the same featured tier', async () => {
    prisma.business.findMany.mockResolvedValue([
      makeBusiness({ id: 'lower-rated', ratingAvg: 3 }),
      makeBusiness({ id: 'higher-rated', ratingAvg: 5 }),
    ]);

    const result = await service.list({});

    expect(result[0].id).toBe('higher-rated');
    expect(result[1].id).toBe('lower-rated');
  });

  it('a business with no membership at all is simply not featured, not an error', async () => {
    prisma.business.findMany.mockResolvedValue([makeBusiness({ id: 'b1', membership: null })]);
    const result = await service.list({});
    expect(result[0].featured).toBe(false);
  });
});
