import { ApiProperty } from '@nestjs/swagger';
import { BusinessDocumentType } from '@prisma/client';
import { IsEnum, IsUrl } from 'class-validator';

export class AddBusinessDocumentDto {
  @ApiProperty({ enum: BusinessDocumentType })
  @IsEnum(BusinessDocumentType)
  type!: BusinessDocumentType;

  @ApiProperty({
    description:
      'URL of the already-uploaded file. Phase 1 assumes the client uploaded it via the storage provider directly; a pre-signed upload-url endpoint is planned once STORAGE_* env vars are provisioned (see docs/09-external-integrations.md).',
  })
  @IsUrl({ require_tld: false })
  fileUrl!: string;
}
