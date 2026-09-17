import { RiderAccountStatus, RiderPayoutMethodType, RoleName, VehicleType } from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { RiderProfileService } from './rider-profile.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RiderLocationService } from '../delivery/rider-location.service';
import { RegisterRiderApplicationDto } from './dto/rider-application.dto';

function baseApplicationDto(overrides: Partial<RegisterRiderApplicationDto> = {}): RegisterRiderApplicationDto {
  return {
    birthDate: '1995-01-01',
    nationalIdNumber: '0102030405',
    phone: '0991234567',
    address: 'Av. Siempre Viva 123',
    city: 'Quito',
    idPhotoFrontUrl: 'http://localhost:3001/uploads/front.jpg',
    idPhotoBackUrl: 'http://localhost:3001/uploads/back.jpg',
    vehicleType: VehicleType.MOTORCYCLE,
    plate: 'ABC-1234',
    payoutMethod: RiderPayoutMethodType.BANK_ACCOUNT,
    bankName: 'Banco Pichincha',
    accountType: 'SAVINGS' as any,
    accountNumber: '1234567890',
    accountHolderName: 'Juan Pérez',
    holderDocumentNumber: '0102030405',
    termsAccepted: true,
    dataConsentAccepted: true,
    ...overrides,
  } as RegisterRiderApplicationDto;
}

describe('RiderProfileService', () => {
  let service: RiderProfileService;
  let prisma: any;
  let location: any;

  beforeEach(() => {
    prisma = {
      role: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'role-rider', name: RoleName.RIDER }) },
      userRole: { upsert: jest.fn() },
      user: { update: jest.fn() },
      rider: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      vehicle: { deleteMany: jest.fn(), create: jest.fn() },
      riderDocument: { deleteMany: jest.fn(), createMany: jest.fn() },
      riderPayoutMethod: { upsert: jest.fn() },
      riderEarning: { findMany: jest.fn() },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };
    location = { recordUpdate: jest.fn() };
    service = new RiderProfileService(prisma as unknown as PrismaService, location as unknown as RiderLocationService);
  });

  describe('applyAsRider', () => {
    it('attaches the RIDER role via an idempotent upsert, not a plain create', async () => {
      prisma.rider.findUnique
        .mockResolvedValueOnce({ id: 'r1', userId: 'u1', accountStatus: RiderAccountStatus.PENDING_APPROVAL })
        .mockResolvedValueOnce({ id: 'r1', userId: 'u1', accountStatus: RiderAccountStatus.PENDING_APPROVAL });
      prisma.rider.update.mockResolvedValue({ id: 'r1', userId: 'u1', accountStatus: 'PENDING_APPROVAL' });
      await service.applyAsRider('u1', baseApplicationDto());
      expect(prisma.userRole.upsert).toHaveBeenCalledWith({
        where: { userId_roleId: { userId: 'u1', roleId: 'role-rider' } },
        create: { userId: 'u1', roleId: 'role-rider' },
        update: {},
      });
    });

    it('creates the Rider row at PENDING_APPROVAL when none exists yet, plus vehicle/documents/payout', async () => {
      prisma.rider.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'r1', userId: 'u1', accountStatus: 'PENDING_APPROVAL' });
      prisma.rider.create.mockResolvedValue({ id: 'r1', userId: 'u1', accountStatus: 'PENDING_APPROVAL' });

      const result = await service.applyAsRider('u1', baseApplicationDto());

      expect(prisma.rider.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'u1', accountStatus: 'PENDING_APPROVAL' }) }),
      );
      expect(prisma.vehicle.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ riderId: 'r1', type: VehicleType.MOTORCYCLE, plate: 'ABC-1234' }) }),
      );
      expect(prisma.riderDocument.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            expect.objectContaining({ side: 'FRONT', fileUrl: 'http://localhost:3001/uploads/front.jpg' }),
            expect.objectContaining({ side: 'BACK', fileUrl: 'http://localhost:3001/uploads/back.jpg' }),
          ],
        }),
      );
      expect(prisma.riderPayoutMethod.upsert).toHaveBeenCalled();
      expect(result.accountStatus).toBe('PENDING_APPROVAL');
    });

    it('resubmits (updates) rather than duplicating the Rider row for a PENDING_APPROVAL applicant', async () => {
      prisma.rider.findUnique
        .mockResolvedValueOnce({ id: 'existing-rider', userId: 'u1', accountStatus: RiderAccountStatus.PENDING_APPROVAL })
        .mockResolvedValueOnce({ id: 'existing-rider', userId: 'u1', accountStatus: 'PENDING_APPROVAL' });
      prisma.rider.update.mockResolvedValue({ id: 'existing-rider', userId: 'u1', accountStatus: 'PENDING_APPROVAL' });

      await service.applyAsRider('u1', baseApplicationDto());

      expect(prisma.rider.create).not.toHaveBeenCalled();
      expect(prisma.rider.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'existing-rider' } }),
      );
      // A resubmission replaces the previous vehicle/ID set rather than accumulating rows.
      expect(prisma.vehicle.deleteMany).toHaveBeenCalledWith({ where: { riderId: 'existing-rider' } });
    });

    it('rejects a resubmission from a rider who is already ACTIVE', async () => {
      prisma.rider.findUnique.mockResolvedValue({ id: 'existing-rider', userId: 'u1', accountStatus: RiderAccountStatus.ACTIVE });
      await expect(service.applyAsRider('u1', baseApplicationDto())).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a motorcycle/car application with no plate', async () => {
      prisma.rider.findUnique.mockResolvedValue(null);
      await expect(
        service.applyAsRider('u1', baseApplicationDto({ vehicleType: VehicleType.CAR, plate: undefined })),
      ).rejects.toThrow('A license plate is required for motorcycles and cars');
    });

    it('does not require a plate for a bicycle', async () => {
      prisma.rider.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'r1', userId: 'u1', accountStatus: 'PENDING_APPROVAL' });
      prisma.rider.create.mockResolvedValue({ id: 'r1', userId: 'u1', accountStatus: 'PENDING_APPROVAL' });
      await expect(
        service.applyAsRider('u1', baseApplicationDto({ vehicleType: VehicleType.BIKE, plate: undefined })),
      ).resolves.toBeDefined();
    });

    it('rejects a BANK_ACCOUNT payout missing its required fields', async () => {
      prisma.rider.findUnique.mockResolvedValue(null);
      await expect(
        service.applyAsRider('u1', baseApplicationDto({ bankName: undefined, accountType: undefined, accountNumber: undefined })),
      ).rejects.toThrow('bankName, accountType and accountNumber are required for a bank account payout');
    });

    it('rejects a MOBILE_WALLET payout missing its required fields', async () => {
      prisma.rider.findUnique.mockResolvedValue(null);
      await expect(
        service.applyAsRider(
          'u1',
          baseApplicationDto({ payoutMethod: RiderPayoutMethodType.MOBILE_WALLET, bankName: undefined, accountType: undefined, accountNumber: undefined }),
        ),
      ).rejects.toThrow('walletProvider and walletNumber are required for a mobile wallet payout');
    });
  });

  describe('listEarnings', () => {
    it('scopes to the caller\'s own rider row, never an arbitrary riderId', async () => {
      prisma.rider.findUnique.mockResolvedValue({ id: 'r1', userId: 'u1' });
      prisma.riderEarning.findMany.mockResolvedValue([]);
      await service.listEarnings('u1');
      expect(prisma.riderEarning.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { riderId: 'r1' } }),
      );
    });
  });
});
