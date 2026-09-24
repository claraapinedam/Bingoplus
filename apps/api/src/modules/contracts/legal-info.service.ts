import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SetLegalInfoDto } from './dto/set-legal-info.dto';

export interface LegalInfoValues {
  legalName: string;
  taxId: string;
  addressLine: string;
  latitude: number | null;
  longitude: number | null;
  legalRepresentativeName: string;
  signatureImageUrl: string | null;
  privacyEmail: string | null;
}

// Placeholder until an admin actually fills this in — matches this codebase's convention (see
// PricingConfigService's ZERO_CONFIG) of never inventing real-looking legal data by default.
const EMPTY_LEGAL_INFO: LegalInfoValues = {
  legalName: '',
  taxId: '',
  addressLine: '',
  latitude: null,
  longitude: null,
  legalRepresentativeName: '',
  signatureImageUrl: null,
  privacyEmail: null,
};

/**
 * BINGO+'s own legal identity (razón social, RUC, dirección, representante legal) — append-only,
 * latest-row-wins, same shape as PricingConfigService. Feeds the "[RAZÓN SOCIAL BINGO+]" family of
 * placeholders in the real business affiliation contract (ContractsService), replacing the two
 * hardcoded env vars (BINGOPLUS_LEGAL_REPRESENTATIVE_NAME/BINGOPLUS_LEGAL_RUC) this used to read.
 */
@Injectable()
export class LegalInfoService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<LegalInfoValues> {
    const row = await this.prisma.platformLegalInfo.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!row) return EMPTY_LEGAL_INFO;
    return {
      legalName: row.legalName,
      taxId: row.taxId,
      addressLine: row.addressLine,
      latitude: row.latitude,
      longitude: row.longitude,
      legalRepresentativeName: row.legalRepresentativeName,
      signatureImageUrl: row.signatureImageUrl,
      privacyEmail: row.privacyEmail,
    };
  }

  async set(dto: SetLegalInfoDto, updatedBy?: string): Promise<LegalInfoValues> {
    await this.prisma.platformLegalInfo.create({ data: { ...dto, updatedBy } });
    return this.get();
  }
}
