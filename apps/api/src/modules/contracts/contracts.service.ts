import { randomUUID } from 'crypto';
import { BadRequestException, Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Business, BusinessCapabilityType, BusinessStatus, ContractStatus, ContractTemplateType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { STORAGE_PROVIDER_TOKEN, StorageProvider } from '../uploads/providers/storage-provider.interface';
import { BusinessCapabilitiesService } from '../business-capabilities/business-capabilities.service';
import { ContractTemplateService } from './contract-template.service';
import { LegalInfoService } from './legal-info.service';
import { buildContractPdf } from './pdf/contract-pdf.builder';

const BANK_ACCOUNT_TYPE_LABELS: Record<string, string> = {
  SAVINGS: 'Ahorros',
  CHECKING: 'Corriente',
};

const BILLING_FREQUENCY_LABELS: Record<string, string> = {
  MONTHLY: 'mensual',
  YEARLY: 'anual',
};

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    @Inject(STORAGE_PROVIDER_TOKEN) private readonly storage: StorageProvider,
    private readonly capabilities: BusinessCapabilitiesService,
    private readonly templates: ContractTemplateService,
    private readonly legalInfo: LegalInfoService,
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

  private async createPendingContract(business: Business, sellsProducts: boolean, directoryListing: boolean) {
    const snapshot = await this.buildContractSnapshot(business, sellsProducts, directoryListing);
    return this.prisma.businessContract.create({
      data: {
        businessId: business.id,
        idType: business.idType,
        legalName: business.legalName,
        representativeName: business.representativeName,
        taxId: business.taxId,
        sellsProducts,
        directoryListing,
        ...snapshot,
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
   * Consumes the business's drawn signature: substitutes the two date tokens that were left
   * literal at generation time (the actual moment of signature wasn't knowable until now), renders
   * the final PDF, stores it as a BusinessDocument attachment, and emails a copy to the business's
   * onboarding contact address. `signedIp` is the caller's real request IP — the "garantía digital
   * de validez" the contract calls for, stamped on every PDF page alongside the contract's own id.
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

    // [FECHA DE ACEPTACIÓN] (fecha y hora) / [FECHA DE VIGENCIA] (solo fecha) per the variable
    // dictionary — the only two tokens not resolvable at generation time, since the actual moment
    // of signature isn't known until right now.
    const acceptedAtLabel = signedAt.toLocaleString('es-EC', { dateStyle: 'long', timeStyle: 'short' });
    const effectiveDateLabel = signedAt.toLocaleDateString('es-EC', { dateStyle: 'long' });
    const finalContractText = contract.contractText
      .replaceAll('{{fecha_aceptacion}}', acceptedAtLabel)
      .replaceAll('{{fecha_vigencia}}', effectiveDateLabel);

    const pdfBuffer = await buildContractPdf({
      contractId: contract.id,
      idType: contract.idType,
      legalName: contract.legalName,
      representativeName: contract.representativeName,
      taxId: contract.taxId,
      contractBodyText: finalContractText,
      signedAt,
      signedIp,
      signatureImage,
    });

    const pdfUrl = await this.savePdf(pdfBuffer, apiOrigin);

    const isFirstContract = business.status === BusinessStatus.APPROVED;
    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.businessContract.update({
        where: { id: contract.id },
        data: { status: ContractStatus.SIGNED, signedAt, signedIp, signatureDataUrl, pdfUrl, contractText: finalContractText },
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

  /** Signed contract PDFs go through the same StorageProvider as any multipart upload — this one's
   * just server-generated, never uploaded via UploadsController, so it bypasses that endpoint but
   * lands in exactly the same place and is served back the same way. */
  private async savePdf(buffer: Buffer, apiOrigin: string): Promise<string> {
    const filename = `${randomUUID()}.pdf`;
    const { url } = await this.storage.upload(buffer, filename, 'application/pdf', apiOrigin);
    return url;
  }

  /**
   * Resolves every `{{token}}` the real contract template (ContractTemplateService's BUSINESS
   * default, or whatever Admin has since edited it to) can reference, and freezes the resolved
   * values onto the returned snapshot — see the schema comment on BusinessContract for why: a
   * later profile edit, commission change, or membership-plan price change must never retroactively
   * rewrite what a specific business actually agreed to and signed. The two date tokens
   * ({{fecha_aceptacion}}/{{fecha_vigencia}}) are deliberately left unresolved in `contractText`
   * here — see sign(), which is the only place the actual signing moment is known.
   */
  private async buildContractSnapshot(business: Business, sellsProducts: boolean, directoryListing: boolean) {
    const legal = await this.legalInfo.get();
    if (!legal.legalName || !legal.taxId || !legal.addressLine || !legal.legalRepresentativeName) {
      throw new BadRequestException(
        'BINGO+ legal info is not configured yet — set it in Configuración → Información legal before generating a contract.',
      );
    }

    const commission = await this.prisma.commission.findFirst({
      where: { businessId: business.id, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      orderBy: { effectiveFrom: 'desc' },
    });
    const membership = await this.prisma.businessMembership.findUnique({
      where: { businessId: business.id },
      include: { plan: true },
    });

    const commissionRatePercent = commission ? Math.round(Number(commission.rate) * 10000) / 100 : null;
    const membershipPlanName = membership?.plan.name ?? null;
    const membershipPriceUsd = membership ? Number(membership.plan.price) : null;
    const membershipBillingFrequency = membership?.plan.billingFrequency ?? null;

    const razonSocialNegocio = business.legalName?.trim() || business.tradeName;
    const nombreComercialNegocio = business.tradeName?.trim() || business.legalName;
    const tipoIdentificacion = business.idType === 'RUC' ? 'RUC' : 'cédula de ciudadanía';
    const representanteNegocio = business.idType === 'RUC' ? business.representativeName ?? '' : business.legalName;
    const calidadRepresentante = business.idType === 'RUC' ? 'Representante Legal' : 'titular, por sus propios derechos';
    const domicilioNegocio = `${business.addressLine}, ${business.city}`;

    const bankAccountTypeLabel = business.bankAccountType ? BANK_ACCOUNT_TYPE_LABELS[business.bankAccountType] ?? business.bankAccountType : '';
    const planDirectorio = membership
      ? `${membershipPlanName} — ${membership.plan.currency} ${Number(membership.plan.price).toFixed(2)} / ${BILLING_FREQUENCY_LABELS[membershipBillingFrequency ?? ''] ?? 'periodo'}`
      : 'No aplica';

    const template = await this.templates.get(ContractTemplateType.BUSINESS);
    const contractText = template
      .replaceAll('{{razon_social_bingoplus}}', legal.legalName)
      .replaceAll('{{ruc_bingoplus}}', legal.taxId)
      .replaceAll('{{direccion_bingoplus}}', legal.addressLine)
      .replaceAll('{{representante_legal_bingoplus}}', legal.legalRepresentativeName)
      .replaceAll('{{razon_social_negocio}}', razonSocialNegocio)
      .replaceAll('{{nombre_comercial_negocio}}', nombreComercialNegocio)
      .replaceAll('{{tipo_identificacion_negocio}}', tipoIdentificacion)
      .replaceAll('{{numero_identificacion_negocio}}', business.taxId)
      .replaceAll('{{domicilio_negocio}}', domicilioNegocio)
      .replaceAll('{{representante_negocio}}', representanteNegocio)
      .replaceAll('{{calidad_representante_negocio}}', calidadRepresentante)
      .replaceAll('{{check_tienda}}', sellsProducts && !directoryListing ? '☒' : '☐')
      .replaceAll('{{check_directorio}}', directoryListing && !sellsProducts ? '☒' : '☐')
      .replaceAll('{{check_tienda_directorio}}', sellsProducts && directoryListing ? '☒' : '☐')
      .replaceAll('{{comision_marketplace}}', commissionRatePercent !== null ? commissionRatePercent.toFixed(2) : '0.00')
      .replaceAll('{{plan_directorio}}', planDirectorio)
      .replaceAll('{{banco}}', business.bankName ?? '')
      .replaceAll('{{tipo_cuenta}}', bankAccountTypeLabel)
      .replaceAll('{{numero_cuenta}}', business.bankAccountNumber ?? '')
      .replaceAll('{{titular_cuenta}}', business.bankAccountHolderName ?? '');
    // {{fecha_aceptacion}}/{{fecha_vigencia}} deliberately left unresolved — see sign().

    return {
      commissionRatePercent,
      membershipPlanName,
      membershipPriceUsd,
      membershipBillingFrequency,
      businessTradeName: business.tradeName,
      businessAddressLine: domicilioNegocio,
      bankName: business.bankName,
      bankAccountType: bankAccountTypeLabel || null,
      bankAccountNumber: business.bankAccountNumber,
      bankAccountHolderName: business.bankAccountHolderName,
      bingoPlusLegalName: legal.legalName,
      bingoPlusTaxId: legal.taxId,
      bingoPlusAddress: legal.addressLine,
      bingoPlusRepresentativeName: legal.legalRepresentativeName,
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
