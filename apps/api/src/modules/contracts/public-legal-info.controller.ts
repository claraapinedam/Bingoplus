import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { LegalInfoService } from './legal-info.service';

/**
 * Public, read-only sliver of BINGO+'s own legal identity (LegalInfoService/PlatformLegalInfo) —
 * only the values needed to resolve placeholders in the real, static legal documents shown on the
 * business apply form (see BusinessApplyForm's terms/privacy viewers): `legalName`/`taxId` for
 * "{{razon_social_bingoplus}}"/"{{ruc_bingoplus}}" (Terms), plus `addressLine`/`privacyEmail` for
 * "{{direccion_bingoplus}}"/"{{correo_privacidad_bingoplus}}" (Privacy Policy — both are meant to
 * be publicly listed in that document's own "Contacto" section anyway). Deliberately excludes
 * everything else PlatformLegalInfo holds (lat/lng, legal representative name, signature image
 * URL) — those aren't needed here and are more sensitive, so they stay behind the admin-only
 * GET /admin/settings/legal-info (AdminSettingsController), which reuses the same
 * LegalInfoService.get() this controller reads from — no duplicated read logic.
 */
@ApiTags('public/legal-info')
@Controller('public/legal-info')
export class PublicLegalInfoController {
  constructor(private readonly legalInfo: LegalInfoService) {}

  @Public()
  @Get()
  async get() {
    const { legalName, taxId, addressLine, privacyEmail } = await this.legalInfo.get();
    return { legalName, taxId, addressLine, privacyEmail };
  }
}
