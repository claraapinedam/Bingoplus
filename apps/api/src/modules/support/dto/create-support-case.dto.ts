import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SupportSubmitterType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

/** "Soporte con la aplicación" — the general/technical support case form. `submitterType` (and
 * `businessId` when it's BUSINESS) says which app/context this was opened from; the service still
 * independently verifies the caller actually has that context (business membership / a Rider
 * record) before trusting it — see SupportCasesService.create. */
export class CreateSupportCaseDto {
  @ApiProperty({ enum: SupportSubmitterType })
  @IsEnum(SupportSubmitterType)
  submitterType!: SupportSubmitterType;

  @ApiPropertyOptional({ description: 'Required when submitterType = BUSINESS' })
  @IsOptional()
  @IsString()
  businessId?: string;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  subject!: string;

  @ApiProperty()
  @IsString()
  @MinLength(5)
  @MaxLength(4000)
  description!: string;

  @ApiPropertyOptional({ description: 'URL returned by POST /uploads' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  evidenceUrl?: string;
}
