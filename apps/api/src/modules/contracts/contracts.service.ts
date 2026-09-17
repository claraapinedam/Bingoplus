import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessCapabilityType, BusinessStatus, ContractStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { UploadsService } from '../uploads/uploads.service';
import { BusinessCapabilitiesService } from '../business-capabilities/business-capabilities.service';
import { buildContractPdf } from './pdf/contract-pdf.builder';

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
    private readonly uploads: UploadsService,
    private readonly capabilities: BusinessCapabilitiesService,
  ) {}

  /**
   * Called by BusinessesService.approve() right after it creates the Commission row — snapshots
   * the signer identity off Business at this exact moment, so a later profile edit never
   * retroactively changes what's presented for signature. Idempotent: re-approving a business that
   * already has a contract still waiting on a signature reuses that same row instead of orphaning
   * it with a duplicate.
   */
  async createForApprovedBusiness(businessId: string) {
    const existing = await this.prisma.businessContract.findFirst({
      where: { businessId, status: ContractStatus.PENDING_SIGNATURE },
    });
    if (existing) return existing;

    const business = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    if (business.idType === 'RUC' && !business.representativeName) {
      throw new BadRequestException(
        'This business is missing a legal representative name — cannot generate a contract',
      );
    }

    const capabilityMap = await this.capabilities.getMap(businessId);
    return this.createPendingContract(business, capabilityMap.SELLS_PRODUCTS, capabilityMap.DIRECTORY_LISTING);
  }

  /**
   * Called by BusinessesService.setCapabilityAsAdmin right before it would enable SELLS_PRODUCTS
   * or DIRECTORY_LISTING on a business that's already ACTIVE — those two capabilities are the only
   * ones with real payment terms attached (commission vs. membership fee vs. both), so *adding*
   * one that the business's current governing contract doesn't already cover is a material change
   * it has to actually agree to, not something BINGO+ can just flip on unilaterally. Turning a
   * capability *off* never lands here — removing an obligation doesn't need new consent.
   *
   * Returns `requiresSignature: false` when the desired set is already covered (nothing to do —
   * the caller applies the toggle immediately), or `true` with the new pending contract otherwise
   * (the caller must NOT apply the toggle yet; ContractsService.sign() is what applies it once the
   * business actually signs).
   */
  async requestCapabilityChange(
    businessId: string,
    desiredSellsProducts: boolean,
    desiredDirectoryListing: boolean,
  ): Promise<{ requiresSignature: boolean; contract?: Awaited<ReturnType<ContractsService['createPendingContract']>> }> {
    const governing = await this.getGoverningContract(businessId);
    const alreadyCovered =
      governing !== null &&
      (!desiredSellsProducts || governing.sellsProducts) &&
      (!desiredDirectoryListing || governing.directoryListing);
    if (alreadyCovered) {
      return { requiresSignature: false };
    }

    const existingPending = await this.prisma.businessContract.findFirst({
      where: { businessId, status: ContractStatus.PENDING_SIGNATURE },
      orderBy: { createdAt: 'desc' },
    });
    if (existingPending) {
      return { requiresSignature: true, contract: existingPending };
    }

    const business = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    if (business.idType === 'RUC' && !business.representativeName) {
      throw new BadRequestException(
        'This business is missing a legal representative name — cannot generate a contract',
      );
    }
    const contract = await this.createPendingContract(business, desiredSellsProducts, desiredDirectoryListing);
    return { requiresSignature: true, contract };
  }

  private async createPendingContract(
    business: { id: string; idType: 'RUC' | 'CEDULA'; legalName: string; representativeName: string | null; taxId: string },
    sellsProducts: boolean,
    directoryListing: boolean,
  ) {
    const contractText = await this.buildContractBodyText(business.id);
    return this.prisma.businessContract.create({
      data: {
        businessId: business.id,
        idType: business.idType,
        legalName: business.legalName,
        representativeName: business.representativeName,
        taxId: business.taxId,
        sellsProducts,
        directoryListing,
        contractText,
      },
    });
  }

  getLatestForBusiness(businessId: string) {
    return this.prisma.businessContract.findFirst({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Full history, newest first — SUPERSEDED contracts are never deleted or hidden, only
   * demoted, so Admin keeps visibility into every version a business ever signed. */
  listForBusiness(businessId: string) {
    return this.prisma.businessContract.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** The currently-governing contract — the terms actually in force for whatever's live today.
   * At most one SIGNED, non-superseded contract exists per business at any time (sign() enforces
   * this by superseding the previous one whenever a capability-expansion contract gets signed). */
  getGoverningContract(businessId: string) {
    return this.prisma.businessContract.findFirst({
      where: { businessId, status: ContractStatus.SIGNED },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Consumes the business's drawn signature: renders the final PDF (BINGO+'s fixed
   * representative/RUC block plus the business's own signature image), stores it as a
   * BusinessDocument attachment, and emails a copy to the business's onboarding contact address.
   * `signedIp` is the caller's real request IP — the "garantía digital de validez" the contract
   * calls for, stamped on every PDF page alongside the contract's own id.
   *
   * Two distinct businesses can reach this: a first-ever contract (business.status is still
   * APPROVED) flips it to ACTIVE, same as before. A capability-expansion contract for an
   * already-ACTIVE business instead applies whichever capabilities *this* contract newly covers
   * and retires the previous governing contract to SUPERSEDED — the business never goes back
   * through the APPROVED gate just because it added something.
   */
  async sign(businessId: string, signatureDataUrl: string, signedIp: string, apiOrigin: string) {
    const contract = await this.prisma.businessContract.findFirst({
      where: { businessId, status: ContractStatus.PENDING_SIGNATURE },
      orderBy: { createdAt: 'desc' },
    });
    if (!contract) {
      throw new NotFoundException('No contract is pending signature for this business');
    }

    const business = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const signatureImage = decodeDataUrlPng(signatureDataUrl);
    const signedAt = new Date();

    const bingoplusRepresentativeName = this.config.get<string>(
      'BINGOPLUS_LEGAL_REPRESENTATIVE_NAME',
      'Representante Legal BINGO+ (dato de prueba)',
    );
    const bingoplusRuc = this.config.get<string>('BINGOPLUS_LEGAL_RUC', '9999999999001');

    const pdfBuffer = await buildContractPdf({
      contractId: contract.id,
      idType: contract.idType,
      legalName: contract.legalName,
      representativeName: contract.representativeName,
      taxId: contract.taxId,
      contractBodyText: contract.contractText,
      bingoplusRepresentativeName,
      bingoplusRuc,
      signedAt,
      signedIp,
      signatureImage,
    });

    const pdfUrl = this.savePdf(pdfBuffer, apiOrigin);

    const isFirstContract = business.status === BusinessStatus.APPROVED;
    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.businessContract.update({
        where: { id: contract.id },
        data: { status: ContractStatus.SIGNED, signedAt, signedIp, signatureDataUrl, pdfUrl },
      }),
      this.prisma.businessDocument.create({
        data: { businessId, type: 'CONTRACT', fileUrl: pdfUrl, status: 'APPROVED' },
      }),
    ];
    if (isFirstContract) {
      ops.push(this.prisma.business.update({ where: { id: businessId }, data: { status: BusinessStatus.ACTIVE } }));
    } else {
      if (contract.sellsProducts) ops.push(this.capabilities.set(businessId, BusinessCapabilityType.SELLS_PRODUCTS, true));
      if (contract.directoryListing) ops.push(this.capabilities.set(businessId, BusinessCapabilityType.DIRECTORY_LISTING, true));
      ops.push(
        this.prisma.businessContract.updateMany({
          where: { businessId, status: ContractStatus.SIGNED, id: { not: contract.id } },
          data: { status: ContractStatus.SUPERSEDED },
        }),
      );
    }

    await this.prisma.$transaction(ops);
    const signed = await this.prisma.businessContract.findUniqueOrThrow({ where: { id: contract.id } });

    await this.email.sendSignedContractEmail(business.email, business.tradeName, pdfBuffer);

    return signed;
  }

  /** Local-disk save mirroring UploadsService's own convention (random filename under the same
   * uploads/ directory) — this PDF is generated server-side, never uploaded via multipart, so it
   * bypasses UploadsController but lands in the exact same place and is served back the same way. */
  private savePdf(buffer: Buffer, apiOrigin: string): string {
    const dir = this.uploads.directory;
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const filename = `${randomUUID()}.pdf`;
    writeFileSync(join(dir, filename), buffer);
    const apiPrefix = this.config.get<string>('API_PREFIX', 'api/v1');
    return `${apiOrigin}/${apiPrefix}${this.uploads.publicPath(filename)}`;
  }

  /** Fictitious boilerplate clauses (placeholder pending real legal review), but the fees quoted
   * are always the business's actual, already-configured commission rate and membership plan —
   * never invented numbers. */
  private async buildContractBodyText(businessId: string): Promise<string> {
    const commission = await this.prisma.commission.findFirst({
      where: { businessId },
      orderBy: { effectiveFrom: 'desc' },
    });
    const membership = await this.prisma.businessMembership.findUnique({
      where: { businessId },
      include: { plan: true },
    });

    const commissionLine = commission
      ? `BINGO+ cobrará al Negocio una comisión del ${(Number(commission.rate) * 100).toFixed(2)}% sobre cada venta realizada a través del Marketplace.`
      : 'La comisión aplicable al Negocio se definirá conforme a la tarifa vigente de BINGO+ para su categoría.';

    const membershipLine = membership
      ? `Adicionalmente, el Negocio pagará una membresía de ${membership.plan.currency} ${membership.plan.price} por período ${membership.plan.billingFrequency === 'MONTHLY' ? 'mensual' : 'anual'} por su presencia en el Directorio de BINGO+.`
      : '';

    return [
      'CLÁUSULA PRIMERA — OBJETO. Mediante el presente contrato, BINGO+ concede al Negocio acceso a su plataforma tecnológica para la promoción, venta y/o prestación de productos y servicios dirigidos a mascotas, en los términos y condiciones aquí establecidos.',
      `CLÁUSULA SEGUNDA — TARIFAS Y COMISIONES. ${commissionLine} ${membershipLine}`.trim(),
      'CLÁUSULA TERCERA — OBLIGACIONES DEL NEGOCIO. El Negocio se compromete a mantener información veraz y actualizada, cumplir con la normativa sanitaria y comercial aplicable, atender oportunamente los pedidos y reservas recibidos a través de BINGO+, y responder por la calidad de los productos y servicios ofrecidos.',
      'CLÁUSULA CUARTA — OBLIGACIONES DE BINGO+. BINGO+ se compromete a mantener disponible la plataforma con niveles razonables de servicio, procesar los pagos correspondientes al Negocio conforme a los plazos establecidos, y brindar soporte técnico razonable durante la vigencia del contrato.',
      'CLÁUSULA QUINTA — VIGENCIA Y TERMINACIÓN. El presente contrato entra en vigencia en la fecha de su firma digital y se mantendrá vigente hasta que cualquiera de las partes lo termine mediante notificación escrita con al menos 30 días de anticipación, sin perjuicio de las obligaciones ya generadas.',
      'CLÁUSULA SEXTA — CONFIDENCIALIDAD Y DATOS PERSONALES. Ambas partes se obligan a mantener confidencialidad sobre la información comercial intercambiada y a tratar los datos personales de los usuarios conforme a la normativa de protección de datos aplicable.',
      'CLÁUSULA SÉPTIMA — VALIDEZ DE LA FIRMA DIGITAL. Las partes reconocen y aceptan que la firma digital consignada en este documento, junto con el identificador único de contrato y la dirección IP registrada al momento de la firma, constituyen prueba suficiente de la manifestación de voluntad y aceptación de los términos aquí descritos.',
    ].join('\n\n');
  }
}

function decodeDataUrlPng(dataUrl: string): Buffer {
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new BadRequestException('signatureDataUrl must be a base64-encoded PNG data URL');
  }
  return Buffer.from(match[1], 'base64');
}
