import { RiderAccountStatus, RiderIdType, RoleName, VehicleType } from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { RiderProfileService } from './rider-profile.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RiderLocationService } from '../delivery/rider-location.service';
import { RegisterRiderApplicationDto } from './dto/rider-application.dto';

function baseApplicationDto(overrides: Partial<RegisterRiderApplicationDto> = {}): RegisterRiderApplicationDto {
  return {
    birthDate: '1995-01-01',
    idType: RiderIdType.CEDULA,
    nationalIdNumber: '0102030405',
    phone: '0991234567',
    address: 'Av. Siempre Viva 123',
    city: 'Quito',
    idPhotoUrl: 'http://localhost:3001/uploads/id.jpg',
    selfiePhotoUrl: 'http://localhost:3001/uploads/selfie.jpg',
    vehicleType: VehicleType.MOTORCYCLE,
    plate: 'ABC-1234',
    vehicleBrand: 'Honda',
    vehicleModel: 'CB1',
    vehicleColor: 'Rojo',
    vehicleYear: 2022,
    licenseNumber: 'LIC-001',
    licensePhotoUrl: 'http://localhost:3001/uploads/license.jpg',
    vehicleRegistrationPhotoUrl: 'http://localhost:3001/uploads/registration.jpg',
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
            expect.objectContaining({ type: 'ID', fileUrl: 'http://localhost:3001/uploads/id.jpg' }),
            expect.objectContaining({ type: 'SELFIE', fileUrl: 'http://localhost:3001/uploads/selfie.jpg' }),
            expect.objectContaining({ type: 'LICENSE', fileUrl: 'http://localhost:3001/uploads/license.jpg' }),
            expect.objectContaining({ type: 'VEHICLE_REGISTRATION', fileUrl: 'http://localhost:3001/uploads/registration.jpg' }),
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
      ).rejects.toThrow('plate, vehicleBrand, vehicleModel and vehicleYear are required for motorcycles and cars');
    });

    it('rejects a motorcycle/car application with no license number/photo or vehicle registration photo', async () => {
      prisma.rider.findUnique.mockResolvedValue(null);
      await expect(
        service.applyAsRider('u1', baseApplicationDto({ licenseNumber: undefined, licensePhotoUrl: undefined, vehicleRegistrationPhotoUrl: undefined })),
      ).rejects.toThrow('licenseNumber, licensePhotoUrl and vehicleRegistrationPhotoUrl are required for motorcycles and cars');
    });

    it('does not require plate/brand/model/year/license for a bicycle, only color', async () => {
      prisma.rider.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'r1', userId: 'u1', accountStatus: 'PENDING_APPROVAL' });
      prisma.rider.create.mockResolvedValue({ id: 'r1', userId: 'u1', accountStatus: 'PENDING_APPROVAL' });
      await expect(
        service.applyAsRider(
          'u1',
          baseApplicationDto({
            vehicleType: VehicleType.BIKE,
            plate: undefined,
            vehicleBrand: undefined,
            vehicleModel: undefined,
            vehicleYear: undefined,
            licenseNumber: undefined,
            licensePhotoUrl: undefined,
            vehicleRegistrationPhotoUrl: undefined,
          }),
        ),
      ).resolves.toBeDefined();
    });

    it('rejects an application with no vehicleColor, even for a bicycle', async () => {
      prisma.rider.findUnique.mockResolvedValue(null);
      await expect(
        service.applyAsRider('u1', baseApplicationDto({ vehicleType: VehicleType.BIKE, vehicleColor: undefined })),
      ).rejects.toThrow('vehicleColor is required');
    });

    it('rejects an application missing its required bank fields', async () => {
      prisma.rider.findUnique.mockResolvedValue(null);
      await expect(
        service.applyAsRider('u1', baseApplicationDto({ bankName: undefined, accountType: undefined, accountNumber: undefined })),
      ).rejects.toThrow('bankName, accountType and accountNumber are required');
    });

    it('rejects an applicant under 18', async () => {
      prisma.rider.findUnique.mockResolvedValue(null);
      const turningSeventeenToday = new Date();
      turningSeventeenToday.setFullYear(turningSeventeenToday.getFullYear() - 17);
      const birthDate = turningSeventeenToday.toISOString().slice(0, 10);
      await expect(service.applyAsRider('u1', baseApplicationDto({ birthDate }))).rejects.toThrow(
        'You must be at least 18 years old to apply as a rider',
      );
    });

    it('accepts an applicant who turns 18 today', async () => {
      prisma.rider.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'r1', userId: 'u1', accountStatus: 'PENDING_APPROVAL' });
      prisma.rider.create.mockResolvedValue({ id: 'r1', userId: 'u1', accountStatus: 'PENDING_APPROVAL' });
      const turningEighteenToday = new Date();
      turningEighteenToday.setFullYear(turningEighteenToday.getFullYear() - 18);
      const birthDate = turningEighteenToday.toISOString().slice(0, 10);
      await expect(service.applyAsRider('u1', baseApplicationDto({ birthDate }))).resolves.toBeDefined();
    });

    it('rejects a RUC application with no legalName (razón social)', async () => {
      prisma.rider.findUnique.mockResolvedValue(null);
      await expect(
        service.applyAsRider('u1', baseApplicationDto({ idType: RiderIdType.RUC, legalName: undefined })),
      ).rejects.toThrow('legalName (razón social) is required when idType is RUC');
    });

    it('stores legalName for a RUC application', async () => {
      prisma.rider.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'r1', userId: 'u1', accountStatus: 'PENDING_APPROVAL' });
      prisma.rider.create.mockResolvedValue({ id: 'r1', userId: 'u1', accountStatus: 'PENDING_APPROVAL' });

      await service.applyAsRider('u1', baseApplicationDto({ idType: RiderIdType.RUC, legalName: 'Juan Pérez Cía. Ltda.' }));
      expect(prisma.rider.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ idType: 'RUC', legalName: 'Juan Pérez Cía. Ltda.' }) }),
      );
    });

    it('never stores legalName for a CEDULA application, even if one was sent', async () => {
      prisma.rider.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'r1', userId: 'u1', accountStatus: 'PENDING_APPROVAL' });
      prisma.rider.create.mockResolvedValue({ id: 'r1', userId: 'u1', accountStatus: 'PENDING_APPROVAL' });

      await service.applyAsRider('u1', baseApplicationDto({ idType: RiderIdType.CEDULA, legalName: 'Should be ignored' }));
      expect(prisma.rider.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ idType: 'CEDULA', legalName: null }) }),
      );
    });

    it('never stores legalName for a PASAPORTE application', async () => {
      prisma.rider.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'r1', userId: 'u1', accountStatus: 'PENDING_APPROVAL' });
      prisma.rider.create.mockResolvedValue({ id: 'r1', userId: 'u1', accountStatus: 'PENDING_APPROVAL' });

      await service.applyAsRider('u1', baseApplicationDto({ idType: RiderIdType.PASAPORTE, legalName: 'Should be ignored' }));
      expect(prisma.rider.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ idType: 'PASAPORTE', legalName: null }) }),
      );
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
