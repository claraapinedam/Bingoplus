import { randomUUID } from 'crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ContractStatus, ContractTemplateType, Prisma, RiderAccountStatus, RiderDocumentType, RiderIdType, VehicleType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { STORAGE_PROVIDER_TOKEN, StorageProvider } from '../uploads/providers/storage-provider.interface';
import { DeliveryFareConfigService } from '../delivery/delivery-fare-config.service';
import { ContractTemplateService } from './contract-template.service';
import { LegalInfoService } from './legal-info.service';
import { buildRiderContractPdf } from './pdf/rider-contract-pdf.builder';

const ID_TYPE_LABELS: Record<RiderIdType, string> = {
  RUC: 'RUC',
  CEDULA: 'cédula de ciudadanía',
  PASAPORTE: 'pasaporte',
};

const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  MOTORCYCLE: 'Motocicleta',
  BIKE: 'Bicicleta',
  CAR: 'Automóvil',
  WALK: 'A pie',
  OTHER: 'Otro',
};

const BANK_ACCOUNT_TYPE_LABELS: Record<string, string> = {
  SAVINGS: 'Ahorros',
  CHECKING: 'Corriente',
};

const NOT_APPLICABLE = 'No aplica';

type RiderWithRelations = Prisma.RiderGetPayload<{
  include: { user: true; vehicles: true; documents: true; payoutMethod: true };
}>;

@Injectable()
export class RiderContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    @Inject(STORAGE_PROVIDER_TOKEN) private readonly storage: StorageProvider,
    private readonly fareConfig: DeliveryFareConfigService,
    private readonly templates: ContractTemplateService,
    private readonly legalInfo: LegalInfoService,
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

    const rider = await this.prisma.rider.findUniqueOrThrow({
      where: { id: riderId },
      include: { user: true, vehicles: true, documents: true, payoutMethod: true },
    });
    if (!rider.idType || !rider.nationalIdNumber) {
      throw new BadRequestException('This rider is missing identification info — cannot generate a contract');
    }
    if (rider.idType === RiderIdType.RUC && !rider.legalName) {
      throw new BadRequestException('This rider is missing a razón social — cannot generate a contract');
    }

    const legalName = rider.idType === RiderIdType.RUC ? rider.legalName! : `${rider.user.firstName} ${rider.user.lastName}`;
    const snapshot = await this.buildContractSnapshot(rider);

    return this.prisma.riderContract.create({
      data: {
        riderId,
        idType: rider.idType,
        legalName,
        taxId: rider.nationalIdNumber,
        ...snapshot,
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
   * Consumes the rider's drawn signature: substitutes the {{fecha_aceptacion}} token left literal
   * at generation time, renders the final PDF, stores it as a RiderDocument attachment, emails a
   * copy, and flips the rider to ACTIVE. Mirrors ContractsService.sign, minus the
   * capability-expansion branch — a rider only ever has this one "first contract" moment.
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

    const acceptedAtLabel = signedAt.toLocaleString('es-EC', { dateStyle: 'long', timeStyle: 'short' });
    const finalContractText = contract.contractText.replaceAll('{{fecha_aceptacion}}', acceptedAtLabel);

    const bingoplusSignatureImage = contract.bingoPlusSignatureImageUrl
      ? await fetch(contract.bingoPlusSignatureImageUrl)
          .then((res) => res.arrayBuffer())
          .then((buf) => Buffer.from(buf))
          .catch(() => null)
      : null;

    const pdfBuffer = await buildRiderContractPdf({
      contractId: contract.id,
      idType: contract.idType,
      legalName: contract.legalName,
      taxId: contract.taxId,
      contractBodyText: finalContractText,
      bingoplusRepresentativeName: contract.bingoPlusRepresentativeName ?? '',
      bingoplusSignatureImage,
      signedAt,
      signedIp,
      signatureImage,
    });

    const pdfUrl = await this.savePdf(pdfBuffer, apiOrigin);

    await this.prisma.$transaction([
      this.prisma.riderContract.update({
        where: { id: contract.id },
        data: { status: ContractStatus.SIGNED, signedAt, signedIp, signatureDataUrl, pdfUrl, contractText: finalContractText },
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

  /**
   * Resolves every `{{token}}` the real contract template (ContractTemplateService's RIDER
   * default, or whatever Admin has since edited it to) can reference, and freezes the resolved
   * values onto the returned snapshot — see the schema comment on RiderContract. {{fecha_aceptacion}}
   * is deliberately left unresolved here — see sign(), the only place the actual signing moment is
   * known.
   */
  private async buildContractSnapshot(rider: RiderWithRelations) {
    const legal = await this.legalInfo.get();
    if (!legal.legalName || !legal.taxId || !legal.addressLine || !legal.legalRepresentativeName) {
      throw new BadRequestException(
        'BINGO+ legal info is not configured yet — set it in Configuración → Información legal before generating a contract.',
      );
    }

    const fare = await this.fareConfig.get();
    const bingoCommissionPercent = Math.round(fare.bingoCommissionPercent * 10000) / 100;
    const riderTaxWithholdingPercent = Math.round(fare.riderTaxWithholdingPercent * 10000) / 100;
    const riderCommissionPercent = Math.round((100 - bingoCommissionPercent) * 100) / 100;

    const nombreCompletoRider = `${rider.user.firstName} ${rider.user.lastName}`;
    const tipoIdentificacionRider = ID_TYPE_LABELS[rider.idType!];

    const vehicle = rider.vehicles[0] as (typeof rider.vehicles)[number] | undefined;
    const isMotorized = vehicle ? vehicle.type === VehicleType.MOTORCYCLE || vehicle.type === VehicleType.CAR : false;
    const vehicleTypeLabel = vehicle ? VEHICLE_TYPE_LABELS[vehicle.type] : NOT_APPLICABLE;
    const vehicleColor = vehicle?.color ?? NOT_APPLICABLE;
    const vehicleBrand = isMotorized ? vehicle?.brand ?? NOT_APPLICABLE : NOT_APPLICABLE;
    const vehicleModel = isMotorized ? vehicle?.model ?? NOT_APPLICABLE : NOT_APPLICABLE;
    const vehicleYear = isMotorized && vehicle?.year != null ? String(vehicle.year) : NOT_APPLICABLE;
    const vehiclePlate = isMotorized ? vehicle?.plate ?? NOT_APPLICABLE : NOT_APPLICABLE;

    const licenseDoc = isMotorized ? rider.documents.find((d) => d.type === RiderDocumentType.LICENSE) : undefined;
    const licenseNumber = licenseDoc?.documentNumber ?? (isMotorized ? NOT_APPLICABLE : NOT_APPLICABLE);
    const licenseExpiration = licenseDoc?.expirationDate
      ? licenseDoc.expirationDate.toLocaleDateString('es-EC')
      : NOT_APPLICABLE;

    const bankAccountTypeLabel = rider.payoutMethod?.accountType ? BANK_ACCOUNT_TYPE_LABELS[rider.payoutMethod.accountType] ?? rider.payoutMethod.accountType : '';

    const template = await this.templates.get(ContractTemplateType.RIDER);
    const contractText = template
      .replaceAll('{{razon_social_bingoplus}}', legal.legalName)
      .replaceAll('{{ruc_bingoplus}}', legal.taxId)
      .replaceAll('{{direccion_bingoplus}}', legal.addressLine)
      .replaceAll('{{representante_legal_bingoplus}}', legal.legalRepresentativeName)
      .replaceAll('{{nombre_completo_rider}}', nombreCompletoRider)
      .replaceAll('{{tipo_identificacion_rider}}', tipoIdentificacionRider)
      .replaceAll('{{numero_identificacion_rider}}', rider.nationalIdNumber ?? '')
      .replaceAll('{{domicilio_rider}}', rider.address ?? '')
      .replaceAll('{{telefono_rider}}', rider.user.phone ?? '')
      .replaceAll('{{correo_rider}}', rider.user.email)
      .replaceAll('{{banco}}', rider.payoutMethod?.bankName ?? '')
      .replaceAll('{{tipo_cuenta}}', bankAccountTypeLabel)
      .replaceAll('{{numero_cuenta}}', rider.payoutMethod?.accountNumber ?? '')
      .replaceAll('{{titular_cuenta}}', rider.payoutMethod?.accountHolderName ?? '')
      .replaceAll('{{tipo_vehiculo}}', vehicleTypeLabel)
      .replaceAll('{{color_vehiculo}}', vehicleColor)
      .replaceAll('{{marca_vehiculo}}', vehicleBrand)
      .replaceAll('{{modelo_vehiculo}}', vehicleModel)
      .replaceAll('{{anio_vehiculo}}', vehicleYear)
      .replaceAll('{{placa}}', vehiclePlate)
      .replaceAll('{{numero_licencia}}', licenseNumber)
      .replaceAll('{{vigencia_licencia}}', licenseExpiration)
      .replaceAll('{{comision_bingo_delivery}}', bingoCommissionPercent.toFixed(2))
      .replaceAll('{{comision_rider}}', riderCommissionPercent.toFixed(2));
    // {{fecha_aceptacion}} deliberately left unresolved — see sign().

    return {
      bingoCommissionPercent,
      riderTaxWithholdingPercent,
      riderPhone: rider.user.phone,
      riderEmail: rider.user.email,
      riderAddress: rider.address,
      vehicleType: vehicleTypeLabel,
      vehicleColor,
      vehicleBrand,
      vehicleModel,
      vehicleYear,
      vehiclePlate,
      licenseNumber,
      licenseExpiration,
      bankName: rider.payoutMethod?.bankName ?? null,
      bankAccountType: bankAccountTypeLabel || null,
      bankAccountNumber: rider.payoutMethod?.accountNumber ?? null,
      bankAccountHolderName: rider.payoutMethod?.accountHolderName ?? null,
      bingoPlusLegalName: legal.legalName,
      bingoPlusTaxId: legal.taxId,
      bingoPlusAddress: legal.addressLine,
      bingoPlusRepresentativeName: legal.legalRepresentativeName,
      bingoPlusSignatureImageUrl: legal.signatureImageUrl,
      contractText,
    };
  }
}

function decodeDataUrlPng(dataUrl: string): Buffer {
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new BadRequestException('signatureDataUrl must be a base64-encoded PNG data URL');
  }
  return Buffer.from(match[1], 'base64');
}
