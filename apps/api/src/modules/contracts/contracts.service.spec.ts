import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContractsService } from './contracts.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { UploadsService } from '../uploads/uploads.service';

// A real, minimal 1x1 transparent PNG — pdfkit's doc.image() needs actual valid PNG bytes to not throw.
const VALID_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('ContractsService', () => {
  let service: ContractsService;
  let prisma: any;
  let email: { sendSignedContractEmail: jest.Mock };

  beforeEach(() => {
    prisma = {
      businessContract: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      business: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
      businessDocument: { create: jest.fn() },
      commission: { findFirst: jest.fn().mockResolvedValue(null) },
      businessMembership: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
    };
    email = { sendSignedContractEmail: jest.fn().mockResolvedValue(undefined) };
    const config = { get: jest.fn((_key: string, fallback?: unknown) => fallback) } as unknown as ConfigService;
    const uploads = { directory: '/tmp/bingoplus-test-uploads', publicPath: (f: string) => `/uploads/${f}` } as unknown as UploadsService;

    service = new ContractsService(
      prisma as unknown as PrismaService,
      config,
      email as unknown as EmailService,
      uploads,
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

    it('generates the PDF, attaches it, activates the business, and emails the signer on success', async () => {
      prisma.businessContract.findFirst.mockResolvedValue({
        id: 'c1',
        idType: 'CEDULA',
        legalName: 'Juan Pérez',
        representativeName: null,
        taxId: '0102030405',
        contractText: 'Cuerpo del contrato.',
      });
      prisma.business.findUniqueOrThrow.mockResolvedValue({ id: 'b1', email: 'b@example.com', tradeName: 'Biz' });
      prisma.businessDocument.create.mockResolvedValue({ id: 'doc1' });
      prisma.business.update.mockResolvedValue({ id: 'b1', status: 'ACTIVE' });
      prisma.businessContract.update.mockResolvedValue({ id: 'c1', status: 'SIGNED' });

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
  });
});
