import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessIdType, ContractStatus, RiderAccountStatus, RiderDocumentType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { UploadsService } from '../uploads/uploads.service';
import { DeliveryFareConfigService } from '../delivery/delivery-fare-config.service';
import { buildRiderContractPdf } from './pdf/rider-contract-pdf.builder';

@Injectable()
export class RiderContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
    private readonly uploads: UploadsService,
    private readonly fareConfig: DeliveryFareConfigService,
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
    if (rider.idType === BusinessIdType.RUC && !rider.legalName) {
      throw new BadRequestException('This rider is missing a razón social — cannot generate a contract');
    }

    const legalName = rider.idType === BusinessIdType.RUC ? rider.legalName! : `${rider.user.firstName} ${rider.user.lastName}`;
    const fare = await this.fareConfig.get();
    const bingoCommissionPercent = Math.round(fare.bingoCommissionPercent * 10000) / 100;
    const riderTaxWithholdingPercent = Math.round(fare.riderTaxWithholdingPercent * 10000) / 100;

    return this.prisma.riderContract.create({
      data: {
        riderId,
        idType: rider.idType,
        legalName,
        taxId: rider.nationalIdNumber,
        bingoCommissionPercent,
        riderTaxWithholdingPercent,
        contractText: buildContractText(bingoCommissionPercent, riderTaxWithholdingPercent),
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

    const pdfUrl = this.savePdf(pdfBuffer, apiOrigin);

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

  private savePdf(buffer: Buffer, apiOrigin: string): string {
    const dir = this.uploads.directory;
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const filename = `${randomUUID()}.pdf`;
    writeFileSync(join(dir, filename), buffer);
    const apiPrefix = this.config.get<string>('API_PREFIX', 'api/v1');
    return `${apiOrigin}/${apiPrefix}${this.uploads.publicPath(filename)}`;
  }
}

/** Fictitious boilerplate clauses (placeholder pending real legal review), but the commission and
 * tax-withholding figures quoted are always the platform's actual, currently-configured
 * DeliveryFareConfig values — never invented numbers. Frozen onto the contract row itself at
 * generation time (see the schema comment on RiderContract), never recomputed later. */
function buildContractText(bingoCommissionPercent: number, riderTaxWithholdingPercent: number): string {
  return [
    'CLÁUSULA PRIMERA — OBJETO. Mediante el presente contrato, BINGO+ concede al Rider acceso a su plataforma tecnológica para recibir y ejecutar entregas de pedidos a través de la aplicación BINGO+ Rider, en los términos y condiciones aquí establecidos.',
    `CLÁUSULA SEGUNDA — TARIFAS, COMISIÓN Y RETENCIÓN. La tarifa de cada entrega la calcula BINGO+ según su fórmula vigente (tarifa mínima según franja horaria, distancia recorrida, tiempo y demanda). Sobre esa tarifa, BINGO+ retiene una comisión del ${bingoCommissionPercent.toFixed(2)}%. Sobre el monto restante, BINGO+ retiene además un ${riderTaxWithholdingPercent.toFixed(2)}% en concepto de impuestos, transfiriendo al Rider el valor neto resultante.`,
    'CLÁUSULA TERCERA — OBLIGACIONES DEL RIDER. El Rider se compromete a mantener actualizada su información personal, de identificación y de vehículo, a ejecutar las entregas aceptadas dentro de tiempos razonables y con el debido cuidado de los productos transportados, y a cumplir con la normativa de tránsito aplicable.',
    'CLÁUSULA CUARTA — OBLIGACIONES DE BINGO+. BINGO+ se compromete a mantener disponible la plataforma con niveles razonables de servicio, a transferir al Rider el valor neto de cada entrega completada conforme a los plazos establecidos, y a brindar soporte razonable durante la vigencia del contrato.',
    'CLÁUSULA QUINTA — VIGENCIA Y TERMINACIÓN. El presente contrato entra en vigencia en la fecha de su firma digital y se mantendrá vigente hasta que cualquiera de las partes lo termine mediante notificación escrita con al menos 30 días de anticipación, sin perjuicio de las obligaciones ya generadas.',
    'CLÁUSULA SEXTA — CONFIDENCIALIDAD Y DATOS PERSONALES. Ambas partes se obligan a mantener confidencialidad sobre la información comercial intercambiada y a tratar los datos personales de los usuarios conforme a la normativa de protección de datos aplicable.',
    'CLÁUSULA SÉPTIMA — VALIDEZ DE LA FIRMA DIGITAL. Las partes reconocen y aceptan que la firma digital consignada en este documento, junto con el identificador único de contrato y la dirección IP registrada al momento de la firma, constituyen prueba suficiente de la manifestación de voluntad y aceptación de los términos aquí descritos.',
  ].join('\n\n');
}

function decodeDataUrlPng(dataUrl: string): Buffer {
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new BadRequestException('signatureDataUrl must be a base64-encoded PNG data URL');
  }
  return Buffer.from(match[1], 'base64');
}
