import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PetFriendlyPlaceCategory, PetFriendlyPlaceStatus } from '@prisma/client';
import { PetFriendlyPlacesService } from './pet-friendly-places.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notifications/notification.service';

describe('PetFriendlyPlacesService', () => {
  let service: PetFriendlyPlacesService;
  let prisma: any;
  let notifications: any;

  beforeEach(() => {
    prisma = {
      petFriendlyPlace: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
    };
    notifications = { notify: jest.fn().mockResolvedValue(undefined) };
    service = new PetFriendlyPlacesService(prisma as unknown as PrismaService, notifications as unknown as NotificationService);
  });

  describe('create', () => {
    it('always starts a new submission as PENDING, never pre-approved', async () => {
      prisma.petFriendlyPlace.create.mockResolvedValue({ id: 'p1', status: PetFriendlyPlaceStatus.PENDING });
      await service.create('user-1', {
        name: 'Café Huellas',
        category: PetFriendlyPlaceCategory.RESTAURANT,
        address: 'Av. Siempre Viva 123',
        latitude: -0.18,
        longitude: -78.47,
      });
      expect(prisma.petFriendlyPlace.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ submittedById: 'user-1', status: PetFriendlyPlaceStatus.PENDING }),
        }),
      );
    });
  });

  describe('getApproved', () => {
    it('404s on a place that is still PENDING — not visible to the public yet', async () => {
      prisma.petFriendlyPlace.findUnique.mockResolvedValue({ id: 'p1', status: PetFriendlyPlaceStatus.PENDING });
      await expect(service.getApproved('p1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404s on a REJECTED place too', async () => {
      prisma.petFriendlyPlace.findUnique.mockResolvedValue({ id: 'p1', status: PetFriendlyPlaceStatus.REJECTED });
      await expect(service.getApproved('p1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns an APPROVED place', async () => {
      prisma.petFriendlyPlace.findUnique.mockResolvedValue({ id: 'p1', status: PetFriendlyPlaceStatus.APPROVED });
      await expect(service.getApproved('p1')).resolves.toEqual({ id: 'p1', status: PetFriendlyPlaceStatus.APPROVED });
    });
  });

  describe('approve', () => {
    it('only approves places that are PENDING', async () => {
      prisma.petFriendlyPlace.findUnique.mockResolvedValue({ id: 'p1', status: PetFriendlyPlaceStatus.APPROVED, submittedById: 'user-1' });
      await expect(service.approve('admin-1', 'p1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('approves a pending place and notifies the submitter', async () => {
      prisma.petFriendlyPlace.findUnique.mockResolvedValue({
        id: 'p1',
        status: PetFriendlyPlaceStatus.PENDING,
        submittedById: 'user-1',
        name: 'Café Huellas',
      });
      prisma.petFriendlyPlace.update.mockResolvedValue({ id: 'p1', status: PetFriendlyPlaceStatus.APPROVED });

      const result = await service.approve('admin-1', 'p1');

      expect(prisma.petFriendlyPlace.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p1' },
          data: expect.objectContaining({ status: PetFriendlyPlaceStatus.APPROVED, reviewedById: 'admin-1' }),
        }),
      );
      expect(notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', event: 'pet_friendly_place.approved' }));
      expect(result.status).toBe(PetFriendlyPlaceStatus.APPROVED);
    });
  });

  describe('reject', () => {
    it('only rejects places that are PENDING', async () => {
      prisma.petFriendlyPlace.findUnique.mockResolvedValue({ id: 'p1', status: PetFriendlyPlaceStatus.REJECTED, submittedById: 'user-1' });
      await expect(service.reject('admin-1', 'p1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a pending place with a reason and notifies the submitter', async () => {
      prisma.petFriendlyPlace.findUnique.mockResolvedValue({
        id: 'p1',
        status: PetFriendlyPlaceStatus.PENDING,
        submittedById: 'user-1',
        name: 'Café Huellas',
      });
      prisma.petFriendlyPlace.update.mockResolvedValue({ id: 'p1', status: PetFriendlyPlaceStatus.REJECTED });

      await service.reject('admin-1', 'p1', 'Duplicado');

      expect(prisma.petFriendlyPlace.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: PetFriendlyPlaceStatus.REJECTED, rejectionReason: 'Duplicado' }),
        }),
      );
      expect(notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', event: 'pet_friendly_place.rejected' }));
    });
  });

  describe('listApproved', () => {
    it('only ever queries APPROVED places for the public directory', async () => {
      prisma.petFriendlyPlace.count.mockResolvedValue(0);
      prisma.petFriendlyPlace.findMany.mockResolvedValue([]);
      await service.listApproved({});
      const where = prisma.petFriendlyPlace.count.mock.calls[0][0].where;
      expect(where.status).toBe(PetFriendlyPlaceStatus.APPROVED);
    });
  });

  describe('suspend', () => {
    it('only suspends places that are APPROVED', async () => {
      prisma.petFriendlyPlace.findUnique.mockResolvedValue({ id: 'p1', status: PetFriendlyPlaceStatus.PENDING });
      await expect(service.suspend('p1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('pulls an approved place out of the public directory', async () => {
      prisma.petFriendlyPlace.findUnique.mockResolvedValue({ id: 'p1', status: PetFriendlyPlaceStatus.APPROVED });
      prisma.petFriendlyPlace.update.mockResolvedValue({ id: 'p1', status: PetFriendlyPlaceStatus.SUSPENDED });

      await service.suspend('p1');

      expect(prisma.petFriendlyPlace.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { status: PetFriendlyPlaceStatus.SUSPENDED },
      });
    });
  });

  describe('reactivate', () => {
    it('only reactivates places that are SUSPENDED', async () => {
      prisma.petFriendlyPlace.findUnique.mockResolvedValue({ id: 'p1', status: PetFriendlyPlaceStatus.APPROVED });
      await expect(service.reactivate('p1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('puts a suspended place back into the public directory', async () => {
      prisma.petFriendlyPlace.findUnique.mockResolvedValue({ id: 'p1', status: PetFriendlyPlaceStatus.SUSPENDED });
      prisma.petFriendlyPlace.update.mockResolvedValue({ id: 'p1', status: PetFriendlyPlaceStatus.APPROVED });

      await service.reactivate('p1');

      expect(prisma.petFriendlyPlace.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { status: PetFriendlyPlaceStatus.APPROVED },
      });
    });
  });
});
