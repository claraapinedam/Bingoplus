import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContractsService } from './contracts.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { UploadsService } from '../uploads/uploads.service';
import { BusinessCapabilitiesService } from '../business-capabilities/business-capabilities.service';

// A real, minimal 1x1 transparent PNG — pdfkit's doc.image() needs actual valid PNG bytes to not throw.
const VALID_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('ContractsService', () => {
  let service: ContractsService;
  let prisma: any;
  let email: { sendSignedContractEmail: jest.Mock };
  let capabilities: { getMap: jest.Mock; set: jest.Mock };

  beforeEach(() => {
    prisma = {
      businessContract: { findFirst: jest.fn(), findUniqueOrThrow: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      business: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
      businessDocument: { create: jest.fn() },
      commission: { findFirst: jest.fn().mockResolvedValue(null) },
      businessMembership: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
    };
    email = { sendSignedContractEmail: jest.fn().mockResolvedValue(undefined) };
    capabilities = {
      getMap: jest.fn().mockResolvedValue({ SELLS_PRODUCTS: false, DIRECTORY_LISTING: false }),
      set: jest.fn().mockResolvedValue({ id: 'cap1' }),
    };
    const config = { get: jest.fn((_key: string, fallback?: unknown) => fallback) } as unknown as ConfigService;
    const uploads = { directory: '/tmp/bingoplus-test-uploads', publicPath: (f: string) => `/uploads/${f}` } as unknown as UploadsService;

    service = new ContractsService(
      prisma as unknown as PrismaService,
      config,
      email as unknown as EmailService,
      uploads,
      capabilities as unknown as BusinessCapabilitiesService,
    );
  });

  describe('createForApprovedBusiness', () => {
    it('reuses an existing pending contract instead of creating a duplicate', async () => {
      prisma.businessContract.findFirst.mockResolvedValue({ id: 'c1', status: 'PENDING_SIGNATURE' });

      const result = await service.createForApprovedBusiness('b1');

      expect(result).toEqual({ id: 'c1', status: 'PENDING_SIGNATURE' });
      expect(prisma.businessContract.create).not.toHaveBeenCalled();
    });

    it('rejects a RUC business with no legal representative name on file', async () => {
      prisma.businessContract.findFirst.mockResolvedValue(null);
      prisma.business.findUniqueOrThrow.mockResolvedValue({
        id: 'b1',
        idType: 'RUC',
        representativeName: null,
        legalName: 'Acme SA',
        taxId: '123',
      });

      await expect(service.createForApprovedBusiness('b1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.businessContract.create).not.toHaveBeenCalled();
    });

    it('snapshots the business identity onto a new contract row', async () => {
      prisma.businessContract.findFirst.mockResolvedValue(null);
      prisma.business.findUniqueOrThrow.mockResolvedValue({
        id: 'b1',
        idType: 'CEDULA',
        representativeName: null,
        legalName: 'Juan Pérez',
        taxId: '0102030405',
      });
      prisma.businessContract.create.mockResolvedValue({ id: 'c1' });

      await service.createForApprovedBusiness('b1');

      expect(prisma.businessContract.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            businessId: 'b1',
            idType: 'CEDULA',
            legalName: 'Juan Pérez',
            taxId: '0102030405',
            commissionRatePercent: null,
            membershipPlanName: null,
            membershipPriceUsd: null,
          }),
        }),
      );
    });

    it('freezes the real commission rate and membership price onto the contract as a snapshot', async () => {
      prisma.businessContract.findFirst.mockResolvedValue(null);
      prisma.business.findUniqueOrThrow.mockResolvedValue({
        id: 'b1',
        idType: 'RUC',
        representativeName: 'Ana Pérez',
        legalName: 'Acme SA',
        taxId: '123',
      });
      prisma.commission.findFirst.mockResolvedValue({ rate: 0.15 });
      prisma.businessMembership.findUnique.mockResolvedValue({
        plan: { name: 'Plan Starter', price: 25, currency: 'USD', billingFrequency: 'MONTHLY' },
      });
      prisma.businessContract.create.mockResolvedValue({ id: 'c1' });

      await service.createForApprovedBusiness('b1');

      expect(prisma.businessContract.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            commissionRatePercent: 15,
            membershipPlanName: 'Plan Starter',
            membershipPriceUsd: 25,
            membershipBillingFrequency: 'MONTHLY',
          }),
        }),
      );
    });
  });

  describe('sign', () => {
    it('rejects when there is no contract pending signature', async () => {
      prisma.businessContract.findFirst.mockResolvedValue(null);

      await expect(service.sign('b1', VALID_PNG_DATA_URL, '1.2.3.4', 'http://localhost:3001')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects a malformed (non-PNG-data-URL) signature before touching the database', async () => {
      prisma.businessContract.findFirst.mockResolvedValue({ id: 'c1', idType: 'CEDULA', legalName: 'Juan Pérez', taxId: '1', contractText: 'x' });
      prisma.business.findUniqueOrThrow.mockResolvedValue({ id: 'b1', email: 'b@example.com', tradeName: 'Biz' });

      await expect(service.sign('b1', 'not-a-data-url', '1.2.3.4', 'http://localhost:3001')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.businessDocument.create).not.toHaveBeenCalled();
    });

    it('generates the PDF, attaches it, activates the business (first contract), and emails the signer on success', async () => {
      prisma.businessContract.findFirst.mockResolvedValue({
        id: 'c1',
        idType: 'CEDULA',
        legalName: 'Juan Pérez',
        representativeName: null,
        taxId: '0102030405',
        contractText: 'Cuerpo del contrato.',
        sellsProducts: true,
        directoryListing: false,
      });
      // status: APPROVED — this is the business's very first contract, not yet ACTIVE.
      prisma.business.findUniqueOrThrow.mockResolvedValue({ id: 'b1', email: 'b@example.com', tradeName: 'Biz', status: 'APPROVED' });
      prisma.businessDocument.create.mockResolvedValue({ id: 'doc1' });
      prisma.business.update.mockResolvedValue({ id: 'b1', status: 'ACTIVE' });
      prisma.businessContract.update.mockResolvedValue({ id: 'c1', status: 'SIGNED' });
      prisma.businessContract.findUniqueOrThrow.mockResolvedValue({ id: 'c1', status: 'SIGNED' });

      const result = await service.sign('b1', VALID_PNG_DATA_URL, '1.2.3.4', 'http://localhost:3001');

      expect(prisma.businessDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ businessId: 'b1', type: 'CONTRACT' }) }),
      );
      expect(prisma.business.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { status: 'ACTIVE' } });
      expect(prisma.businessContract.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'c1' },
          data: expect.objectContaining({ status: 'SIGNED', signedIp: '1.2.3.4' }),
        }),
      );
      expect(email.sendSignedContractEmail).toHaveBeenCalledWith('b@example.com', 'Biz', expect.any(Buffer));
      expect(result).toEqual({ id: 'c1', status: 'SIGNED' });
    }, 15000);

    it('applies the new capabilities and supersedes the previous contract for an already-ACTIVE business', async () => {
      prisma.businessContract.findFirst.mockResolvedValue({
        id: 'c2',
        idType: 'CEDULA',
        legalName: 'Juan Pérez',
        representativeName: null,
        taxId: '0102030405',
        contractText: 'Cuerpo del contrato ampliado.',
        sellsProducts: true,
        directoryListing: true,
      });
      // status: ACTIVE already — this contract only adds DIRECTORY_LISTING to an existing business.
      prisma.business.findUniqueOrThrow.mockResolvedValue({ id: 'b1', email: 'b@example.com', tradeName: 'Biz', status: 'ACTIVE' });
      prisma.businessDocument.create.mockResolvedValue({ id: 'doc2' });
      prisma.businessContract.update.mockResolvedValue({ id: 'c2', status: 'SIGNED' });
      prisma.businessContract.findUniqueOrThrow.mockResolvedValue({ id: 'c2', status: 'SIGNED' });

      await service.sign('b1', VALID_PNG_DATA_URL, '1.2.3.4', 'http://localhost:3001');

      expect(prisma.business.update).not.toHaveBeenCalled();
      expect(capabilities.set).toHaveBeenCalledWith('b1', 'SELLS_PRODUCTS', true);
      expect(capabilities.set).toHaveBeenCalledWith('b1', 'DIRECTORY_LISTING', true);
      expect(prisma.businessContract.updateMany).toHaveBeenCalledWith({
        where: { businessId: 'b1', status: 'SIGNED', id: { not: 'c2' } },
        data: { status: 'SUPERSEDED' },
      });
    }, 15000);
  });

  describe('requestCapabilityChange', () => {
    it('does nothing when the governing contract already covers what was requested', async () => {
      jest.spyOn(service, 'getGoverningContract').mockResolvedValue({
        id: 'c1',
        sellsProducts: true,
        directoryListing: false,
      } as any);

      const result = await service.requestCapabilityChange('b1', true, false);

      expect(result).toEqual({ requiresSignature: false });
      expect(prisma.businessContract.create).not.toHaveBeenCalled();
    });

    it('reuses an already-pending request instead of creating a duplicate', async () => {
      jest.spyOn(service, 'getGoverningContract').mockResolvedValue({
        id: 'c1',
        sellsProducts: true,
        directoryListing: false,
      } as any);
      prisma.businessContract.findFirst.mockResolvedValue({ id: 'c2', status: 'PENDING_SIGNATURE' });

      const result = await service.requestCapabilityChange('b1', true, true);

      expect(result).toEqual({ requiresSignature: true, contract: { id: 'c2', status: 'PENDING_SIGNATURE' } });
      expect(prisma.businessContract.create).not.toHaveBeenCalled();
    });

    it('creates a new pending contract covering the newly-requested capabilities', async () => {
      jest.spyOn(service, 'getGoverningContract').mockResolvedValue({
        id: 'c1',
        sellsProducts: true,
        directoryListing: false,
      } as any);
      prisma.businessContract.findFirst.mockResolvedValue(null);
      prisma.business.findUniqueOrThrow.mockResolvedValue({
        id: 'b1',
        idType: 'CEDULA',
        representativeName: null,
        legalName: 'Juan Pérez',
        taxId: '0102030405',
      });
      prisma.businessContract.create.mockResolvedValue({ id: 'c2', status: 'PENDING_SIGNATURE' });

      const result = await service.requestCapabilityChange('b1', true, true);

      expect(result.requiresSignature).toBe(true);
      expect(prisma.businessContract.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ sellsProducts: true, directoryListing: true }) }),
      );
    });
  });
});
