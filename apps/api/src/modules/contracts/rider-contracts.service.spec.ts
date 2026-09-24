import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RiderContractsService } from './rider-contracts.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { StorageProvider } from '../uploads/providers/storage-provider.interface';
import { DeliveryFareConfigService } from '../delivery/delivery-fare-config.service';
import { ContractTemplateService, DEFAULT_RIDER_CONTRACT_TEMPLATE } from './contract-template.service';
import { LegalInfoService, LegalInfoValues } from './legal-info.service';

// A real, minimal 1x1 transparent PNG — pdfkit's doc.image() needs actual valid PNG bytes to not throw.
const VALID_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const VALID_LEGAL_INFO: LegalInfoValues = {
  legalName: 'BINGO+ S.A.S.',
  taxId: '1792345678001',
  addressLine: 'Av. Siempre Viva 123, Quito',
  latitude: null,
  longitude: null,
  legalRepresentativeName: 'María Dolores Pérez',
  signatureImageUrl: null,
  privacyEmail: null,
};

function baseRider(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    idType: 'CEDULA',
    legalName: null,
    nationalIdNumber: '0102030405',
    address: 'Av. Siempre Viva 456',
    user: { firstName: 'Juan', lastName: 'Pérez', email: 'r@example.com', phone: '0991234567' },
    vehicles: [],
    documents: [],
    payoutMethod: null,
    ...overrides,
  };
}

describe('RiderContractsService', () => {
  let service: RiderContractsService;
  let prisma: any;
  let email: { sendSignedContractEmail: jest.Mock };
  let fareConfig: { get: jest.Mock };
  let legalInfo: { get: jest.Mock; set: jest.Mock };

  beforeEach(() => {
    prisma = {
      riderContract: { findFirst: jest.fn(), findUniqueOrThrow: jest.fn(), create: jest.fn(), update: jest.fn() },
      rider: { findUniqueOrThrow: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      riderDocument: { create: jest.fn() },
      $transaction: jest.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
    };
    email = { sendSignedContractEmail: jest.fn().mockResolvedValue(undefined) };
    fareConfig = { get: jest.fn().mockResolvedValue({ bingoCommissionPercent: 0.2, riderTaxWithholdingPercent: 0.08 }) };
    const storage = { upload: jest.fn().mockResolvedValue({ url: 'http://localhost:3001/api/v1/uploads/test.pdf' }) } as unknown as StorageProvider;
    const templates = { get: jest.fn().mockResolvedValue(DEFAULT_RIDER_CONTRACT_TEMPLATE), set: jest.fn() };
    legalInfo = { get: jest.fn().mockResolvedValue(VALID_LEGAL_INFO), set: jest.fn() };

    service = new RiderContractsService(
      prisma as unknown as PrismaService,
      email as unknown as EmailService,
      storage,
      fareConfig as unknown as DeliveryFareConfigService,
      templates as unknown as ContractTemplateService,
      legalInfo as unknown as LegalInfoService,
    );
  });

  describe('createForApprovedRider', () => {
    it('reuses an existing pending contract instead of creating a duplicate', async () => {
      prisma.riderContract.findFirst.mockResolvedValue({ id: 'c1', status: 'PENDING_SIGNATURE' });

      const result = await service.createForApprovedRider('r1');

      expect(result).toEqual({ id: 'c1', status: 'PENDING_SIGNATURE' });
      expect(prisma.riderContract.create).not.toHaveBeenCalled();
    });

    it('rejects a RUC rider with no razón social on file', async () => {
      prisma.riderContract.findFirst.mockResolvedValue(null);
      prisma.rider.findUniqueOrThrow.mockResolvedValue(baseRider({ idType: 'RUC', legalName: null }));

      await expect(service.createForApprovedRider('r1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.riderContract.create).not.toHaveBeenCalled();
    });

    it('rejects a rider missing idType/nationalIdNumber entirely', async () => {
      prisma.riderContract.findFirst.mockResolvedValue(null);
      prisma.rider.findUniqueOrThrow.mockResolvedValue(baseRider({ idType: null, nationalIdNumber: null }));

      await expect(service.createForApprovedRider('r1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when BINGO+ legal info has not been configured yet', async () => {
      legalInfo.get.mockResolvedValueOnce({
        legalName: '',
        taxId: '',
        addressLine: '',
        latitude: null,
        longitude: null,
        legalRepresentativeName: '',
        signatureImageUrl: null,
        privacyEmail: null,
      });
      prisma.riderContract.findFirst.mockResolvedValue(null);
      prisma.rider.findUniqueOrThrow.mockResolvedValue(baseRider());

      await expect(service.createForApprovedRider('r1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.riderContract.create).not.toHaveBeenCalled();
    });

    it('uses the rider\'s own account name as legalName for CEDULA', async () => {
      prisma.riderContract.findFirst.mockResolvedValue(null);
      prisma.rider.findUniqueOrThrow.mockResolvedValue(baseRider({ idType: 'CEDULA', legalName: null }));
      prisma.riderContract.create.mockResolvedValue({ id: 'c1' });

      await service.createForApprovedRider('r1');

      expect(prisma.riderContract.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ riderId: 'r1', idType: 'CEDULA', legalName: 'Juan Pérez', taxId: '0102030405' }),
        }),
      );
    });

    it('uses razón social as legalName for RUC', async () => {
      prisma.riderContract.findFirst.mockResolvedValue(null);
      prisma.rider.findUniqueOrThrow.mockResolvedValue(baseRider({ idType: 'RUC', legalName: 'Juan Pérez Cía. Ltda.' }));
      prisma.riderContract.create.mockResolvedValue({ id: 'c1' });

      await service.createForApprovedRider('r1');

      expect(prisma.riderContract.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ legalName: 'Juan Pérez Cía. Ltda.' }) }),
      );
    });

    it('freezes the real DeliveryFareConfig commission/tax percentages onto the contract as a snapshot', async () => {
      prisma.riderContract.findFirst.mockResolvedValue(null);
      prisma.rider.findUniqueOrThrow.mockResolvedValue(baseRider());
      prisma.riderContract.create.mockResolvedValue({ id: 'c1' });

      await service.createForApprovedRider('r1');

      expect(prisma.riderContract.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ bingoCommissionPercent: 20, riderTaxWithholdingPercent: 8 }),
        }),
      );
    });

    it('resolves vehicle fields to "No aplica" for a bicycle', async () => {
      prisma.riderContract.findFirst.mockResolvedValue(null);
      prisma.rider.findUniqueOrThrow.mockResolvedValue(
        baseRider({ vehicles: [{ type: 'BIKE', color: 'Rojo', brand: null, model: null, year: null, plate: null }] }),
      );
      prisma.riderContract.create.mockResolvedValue({ id: 'c1' });

      await service.createForApprovedRider('r1');

      expect(prisma.riderContract.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vehicleType: 'Bicicleta',
            vehicleColor: 'Rojo',
            vehicleBrand: 'No aplica',
            vehicleModel: 'No aplica',
            vehicleYear: 'No aplica',
            vehiclePlate: 'No aplica',
            licenseNumber: 'No aplica',
          }),
        }),
      );
    });

    it('resolves full vehicle/license fields for a motorcycle', async () => {
      prisma.riderContract.findFirst.mockResolvedValue(null);
      prisma.rider.findUniqueOrThrow.mockResolvedValue(
        baseRider({
          vehicles: [{ type: 'MOTORCYCLE', color: 'Negro', brand: 'Honda', model: 'CB1', year: 2022, plate: 'ABC-123' }],
          documents: [{ type: 'LICENSE', documentNumber: 'LIC-001', expirationDate: null }],
        }),
      );
      prisma.riderContract.create.mockResolvedValue({ id: 'c1' });

      await service.createForApprovedRider('r1');

      expect(prisma.riderContract.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vehicleType: 'Motocicleta',
            vehicleColor: 'Negro',
            vehicleBrand: 'Honda',
            vehicleModel: 'CB1',
            vehicleYear: '2022',
            vehiclePlate: 'ABC-123',
            licenseNumber: 'LIC-001',
          }),
        }),
      );
    });
  });

  describe('sign', () => {
    it('rejects when there is no contract pending signature', async () => {
      prisma.riderContract.findFirst.mockResolvedValue(null);

      await expect(service.sign('r1', VALID_PNG_DATA_URL, '1.2.3.4', 'http://localhost:3001')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects a malformed (non-PNG-data-URL) signature before touching the database', async () => {
      prisma.riderContract.findFirst.mockResolvedValue({ id: 'c1', idType: 'CEDULA', legalName: 'Juan Pérez', taxId: '1', contractText: 'x' });
      prisma.rider.findUniqueOrThrow.mockResolvedValue({ id: 'r1', user: { email: 'r@example.com' } });

      await expect(service.sign('r1', 'not-a-data-url', '1.2.3.4', 'http://localhost:3001')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.riderDocument.create).not.toHaveBeenCalled();
    });

    it('generates the PDF, attaches it, activates the rider, and emails the signer on success', async () => {
      prisma.riderContract.findFirst.mockResolvedValue({
        id: 'c1',
        idType: 'CEDULA',
        legalName: 'Juan Pérez',
        taxId: '0102030405',
        contractText: 'Cuerpo del contrato.',
      });
      prisma.rider.findUniqueOrThrow.mockResolvedValue({ id: 'r1', user: { email: 'r@example.com' } });
      prisma.riderDocument.create.mockResolvedValue({ id: 'doc1' });
      prisma.riderContract.update.mockResolvedValue({ id: 'c1', status: 'SIGNED' });
      prisma.riderContract.findUniqueOrThrow.mockResolvedValue({ id: 'c1', status: 'SIGNED' });

      const result = await service.sign('r1', VALID_PNG_DATA_URL, '1.2.3.4', 'http://localhost:3001');

      expect(prisma.riderDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ riderId: 'r1', type: 'CONTRACT' }) }),
      );
      expect(prisma.riderContract.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'c1' }, data: expect.objectContaining({ status: 'SIGNED', signedIp: '1.2.3.4' }) }),
      );
      expect(email.sendSignedContractEmail).toHaveBeenCalledWith('r@example.com', 'Juan Pérez', expect.any(Buffer));
      expect(result).toEqual({ id: 'c1', status: 'SIGNED' });
    }, 15000);
  });
});
