import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ServicesService } from './services.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ServicesService', () => {
  let service: ServicesService;
  let prisma: any;
  let capabilities: any;

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
    capabilities = { set: jest.fn().mockResolvedValue({ id: 'cap1' }) };
    service = new ServicesService(prisma as unknown as PrismaService, capabilities);
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

  describe('create — locationType, freely choosable, auto-derives HOME_SERVICE', () => {
    it('defaults to AT_BUSINESS without touching the capability', async () => {
      prisma.service.create.mockResolvedValue({ id: 'svc-1' });
      await service.create('biz-1', { type: 'GROOMING', name: 'Baño', price: 10, durationMinutes: 30 } as any);
      expect(capabilities.set).not.toHaveBeenCalled();
      expect(prisma.service.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ locationType: 'AT_BUSINESS' }) }),
      );
    });

    it('accepts AT_CUSTOMER_HOME with no prerequisite and auto-enables HOME_SERVICE', async () => {
      prisma.service.create.mockResolvedValue({ id: 'svc-1' });
      await service.create('biz-1', {
        type: 'GROOMING',
        name: 'Baño a domicilio',
        price: 10,
        durationMinutes: 30,
        locationType: 'AT_CUSTOMER_HOME',
      } as any);
      expect(capabilities.set).toHaveBeenCalledWith('biz-1', 'HOME_SERVICE', true);
      expect(prisma.service.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ locationType: 'AT_CUSTOMER_HOME' }) }),
      );
    });

    it('accepts BOTH the same way, also auto-enabling HOME_SERVICE', async () => {
      prisma.service.create.mockResolvedValue({ id: 'svc-1' });
      await service.create('biz-1', {
        type: 'GROOMING',
        name: 'Baño',
        price: 10,
        durationMinutes: 30,
        locationType: 'BOTH',
      } as any);
      expect(capabilities.set).toHaveBeenCalledWith('biz-1', 'HOME_SERVICE', true);
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

    it('assertOwnedService 404s on an already soft-deleted service', async () => {
      prisma.service.findUnique.mockResolvedValue({ id: 'svc-1', businessId: 'biz-1', deletedAt: new Date() });
      await expect(service.assertOwnedService('biz-1', 'svc-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('activate/deactivate only touch the owning business service', async () => {
      prisma.service.findUnique.mockResolvedValue({ id: 'svc-1', businessId: 'biz-1' });
      prisma.service.update.mockResolvedValue({ id: 'svc-1', active: false });
      await service.deactivate('biz-1', 'svc-1');
      expect(prisma.service.update).toHaveBeenCalledWith({ where: { id: 'svc-1' }, data: { active: false } });
    });
  });

  describe('remove — soft delete', () => {
    it('sets deletedAt instead of hard-deleting, so past bookings still resolve a real row', async () => {
      prisma.service.findUnique.mockResolvedValue({ id: 'svc-1', businessId: 'biz-1' });
      await service.remove('biz-1', 'svc-1');
      expect(prisma.service.update).toHaveBeenCalledWith({
        where: { id: 'svc-1' },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('404s deleting a service that belongs to a different business', async () => {
      prisma.service.findUnique.mockResolvedValue({ id: 'svc-1', businessId: 'other-biz' });
      await expect(service.remove('biz-1', 'svc-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.service.update).not.toHaveBeenCalled();
    });
  });

  describe('getForAdmin', () => {
    it('404s on an unknown service', async () => {
      prisma.service.findUnique.mockResolvedValue(null);
      await expect(service.getForAdmin('ghost')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
