import { randomUUID } from 'crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContractStatus, ContractTemplateType, RiderAccountStatus, RiderDocumentType, RiderIdType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { STORAGE_PROVIDER_TOKEN, StorageProvider } from '../uploads/providers/storage-provider.interface';
import { DeliveryFareConfigService } from '../delivery/delivery-fare-config.service';
import { ContractTemplateService } from './contract-template.service';
import { buildRiderContractPdf } from './pdf/rider-contract-pdf.builder';

@Injectable()
export class RiderContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
    @Inject(STORAGE_PROVIDER_TOKEN) private readonly storage: StorageProvider,
    private readonly fareConfig: DeliveryFareConfigService,
    private readonly templates: ContractTemplateService,
  ) {}

  /**
   * Called by RidersService.approve() right after it flips the rider to APPROVED — snapshots the
   * signer identity and the platform's current delivery-fare commission/tax terms at this exact
   * moment, so a later DeliveryFareConfig change never retroactively rewrites what's presented for
   * signature. Idempotent: re-approving a rider who already has a pending contract reuses it.
   */
  async createForApprovedRider(riderId: string) {
    const existing = await this.prisma.riderContract.findFirst({
      where: { riderId, status: ContractStatus.PENDING_SIGNATURE },
    });
    if (existing) return existing;

    const rider = await this.prisma.rider.findUniqueOrThrow({ where: { id: riderId }, include: { user: true } });
    if (!rider.idType || !rider.nationalIdNumber) {
      throw new BadRequestException('This rider is missing identification info — cannot generate a contract');
    }
    if (rider.idType === RiderIdType.RUC && !rider.legalName) {
      throw new BadRequestException('This rider is missing a razón social — cannot generate a contract');
    }

    const legalName = rider.idType === RiderIdType.RUC ? rider.legalName! : `${rider.user.firstName} ${rider.user.lastName}`;
    const fare = await this.fareConfig.get();
    const bingoCommissionPercent = Math.round(fare.bingoCommissionPercent * 10000) / 100;
    const riderTaxWithholdingPercent = Math.round(fare.riderTaxWithholdingPercent * 10000) / 100;
    const template = await this.templates.get(ContractTemplateType.RIDER);
    const contractText = template
      .replace('{{comision_bingo}}', bingoCommissionPercent.toFixed(2))
      .replace('{{retencion_impuesto}}', riderTaxWithholdingPercent.toFixed(2));

    return this.prisma.riderContract.create({
      data: {
        riderId,
        idType: rider.idType,
        legalName,
        taxId: rider.nationalIdNumber,
        bingoCommissionPercent,
        riderTaxWithholdingPercent,
        contractText,
      },
    });
  }

  getLatestForRider(riderId: string) {
    return this.prisma.riderContract.findFirst({
      where: { riderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Consumes the rider's drawn signature: renders the final PDF, stores it as a RiderDocument
   * attachment, emails a copy, and flips the rider to ACTIVE. Mirrors ContractsService.sign, minus
   * the capability-expansion branch — a rider only ever has this one "first contract" moment.
   */
  async sign(riderId: string, signatureDataUrl: string, signedIp: string, apiOrigin: string) {
    const contract = await this.prisma.riderContract.findFirst({
      where: { riderId, status: ContractStatus.PENDING_SIGNATURE },
      orderBy: { createdAt: 'desc' },
    });
    if (!contract) {
      throw new NotFoundException('No contract is pending signature for this rider');
    }

    const rider = await this.prisma.rider.findUniqueOrThrow({ where: { id: riderId }, include: { user: true } });
    const signatureImage = decodeDataUrlPng(signatureDataUrl);
    const signedAt = new Date();

    const bingoplusRepresentativeName = this.config.get<string>(
      'BINGOPLUS_LEGAL_REPRESENTATIVE_NAME',
      'Representante Legal BINGO+ (dato de prueba)',
    );
    const bingoplusRuc = this.config.get<string>('BINGOPLUS_LEGAL_RUC', '9999999999001');

    const pdfBuffer = await buildRiderContractPdf({
      contractId: contract.id,
      idType: contract.idType,
      legalName: contract.legalName,
      taxId: contract.taxId,
      contractBodyText: contract.contractText,
      bingoplusRepresentativeName,
      bingoplusRuc,
      signedAt,
      signedIp,
      signatureImage,
    });

    const pdfUrl = await this.savePdf(pdfBuffer, apiOrigin);

    await this.prisma.$transaction([
      this.prisma.riderContract.update({
        where: { id: contract.id },
        data: { status: ContractStatus.SIGNED, signedAt, signedIp, signatureDataUrl, pdfUrl },
      }),
      this.prisma.riderDocument.create({
        data: { riderId, type: RiderDocumentType.CONTRACT, fileUrl: pdfUrl, status: 'VERIFIED' },
      }),
      this.prisma.rider.update({ where: { id: riderId }, data: { accountStatus: RiderAccountStatus.ACTIVE } }),
    ]);
    const signed = await this.prisma.riderContract.findUniqueOrThrow({ where: { id: contract.id } });

    await this.email.sendSignedContractEmail(rider.user.email, contract.legalName, pdfBuffer);

    return signed;
  }

  private async savePdf(buffer: Buffer, apiOrigin: string): Promise<string> {
    const filename = `${randomUUID()}.pdf`;
    const { url } = await this.storage.upload(buffer, filename, 'application/pdf', apiOrigin);
    return url;
  }
}

function decodeDataUrlPng(dataUrl: string): Buffer {
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new BadRequestException('signatureDataUrl must be a base64-encoded PNG data URL');
  }
  return Buffer.from(match[1], 'base64');
}
