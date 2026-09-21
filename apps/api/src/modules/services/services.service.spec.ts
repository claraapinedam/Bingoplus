import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ServicesService } from './services.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ServicesService', () => {
  let service: ServicesService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      petSpecies: { findMany: jest.fn().mockResolvedValue([]) },
      service: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      businessCapability: { findUnique: jest.fn() },
      $transaction: jest.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
    };
    service = new ServicesService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('rejects minAgeMonths greater than maxAgeMonths', async () => {
      await expect(
        service.create('biz-1', {
          type: 'GROOMING',
          name: 'Test',
          price: 10,
          durationMinutes: 30,
          minAgeMonths: 24,
          maxAgeMonths: 12,
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects unknown species slugs', async () => {
      prisma.petSpecies.findMany.mockResolvedValue([{ id: 's1', slug: 'dog' }]);
      await expect(
        service.create('biz-1', {
          type: 'GROOMING',
          name: 'Test',
          price: 10,
          durationMinutes: 30,
          speciesSlugs: ['dog', 'dragon'],
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates a service with resolved species ids', async () => {
      prisma.petSpecies.findMany.mockResolvedValue([{ id: 's1', slug: 'dog' }, { id: 's2', slug: 'cat' }]);
      prisma.service.create.mockResolvedValue({ id: 'svc-1' });
      await service.create('biz-1', {
        type: 'VETERINARY',
        name: 'Consulta',
        price: 20,
        durationMinutes: 30,
        speciesSlugs: ['dog', 'cat'],
      } as any);
      expect(prisma.service.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            species: { create: [{ speciesId: 's1' }, { speciesId: 's2' }] },
          }),
        }),
      );
    });
  });

  describe('create — locationType, gated by the HOME_SERVICE capability', () => {
    it('defaults to AT_BUSINESS without even checking the capability', async () => {
      prisma.service.create.mockResolvedValue({ id: 'svc-1' });
      await service.create('biz-1', { type: 'GROOMING', name: 'Baño', price: 10, durationMinutes: 30 } as any);
      expect(prisma.businessCapability.findUnique).not.toHaveBeenCalled();
      expect(prisma.service.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ locationType: 'AT_BUSINESS' }) }),
      );
    });

    it('rejects AT_CUSTOMER_HOME when the business does not have HOME_SERVICE enabled', async () => {
      prisma.businessCapability.findUnique.mockResolvedValue({ enabled: false });
      await expect(
        service.create('biz-1', {
          type: 'GROOMING',
          name: 'Baño a domicilio',
          price: 10,
          durationMinutes: 30,
          locationType: 'AT_CUSTOMER_HOME',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.service.create).not.toHaveBeenCalled();
    });

    it('accepts BOTH once the business has HOME_SERVICE enabled', async () => {
      prisma.businessCapability.findUnique.mockResolvedValue({ enabled: true });
      prisma.service.create.mockResolvedValue({ id: 'svc-1' });
      await service.create('biz-1', {
        type: 'GROOMING',
        name: 'Baño',
        price: 10,
        durationMinutes: 30,
        locationType: 'BOTH',
      } as any);
      expect(prisma.service.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ locationType: 'BOTH' }) }),
      );
    });
  });

  describe('ownership', () => {
    it('assertOwnedService 404s when the service belongs to a different business', async () => {
      prisma.service.findUnique.mockResolvedValue({ id: 'svc-1', businessId: 'other-biz' });
      await expect(service.assertOwnedService('biz-1', 'svc-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('assertOwnedService 404s when the service does not exist', async () => {
      prisma.service.findUnique.mockResolvedValue(null);
      await expect(service.assertOwnedService('biz-1', 'ghost')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('activate/deactivate only touch the owning business service', async () => {
      prisma.service.findUnique.mockResolvedValue({ id: 'svc-1', businessId: 'biz-1' });
      prisma.service.update.mockResolvedValue({ id: 'svc-1', active: false });
      await service.deactivate('biz-1', 'svc-1');
      expect(prisma.service.update).toHaveBeenCalledWith({ where: { id: 'svc-1' }, data: { active: false } });
    });
  });

  describe('getForAdmin', () => {
    it('404s on an unknown service', async () => {
      prisma.service.findUnique.mockResolvedValue(null);
      await expect(service.getForAdmin('ghost')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
