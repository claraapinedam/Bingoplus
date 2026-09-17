import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BusinessIdType } from '@prisma/client';
import { ArrayMinSize, IsArray, IsBoolean, IsEnum, IsLatitude, IsLongitude, IsOptional, IsString } from 'class-validator';

export class ApplyBusinessDto {
  @ApiProperty()
  @IsString()
  tradeName!: string;

  @ApiProperty({
    enum: BusinessIdType,
    description: 'RUC: legalName is the Razón Social and representativeName is required. CEDULA: legalName is just the person\'s own name.',
  })
  @IsEnum(BusinessIdType)
  idType!: BusinessIdType;

  @ApiProperty({ description: 'Razón Social (RUC) or Nombre y Apellido (CEDULA)' })
  @IsString()
  legalName!: string;

  @ApiPropertyOptional({ description: 'Legal representative full name — required when idType is RUC' })
  @IsOptional()
  @IsString()
  representativeName?: string;

  @ApiProperty()
  @IsString()
  taxId!: string;

  @ApiProperty()
  @IsString()
  email!: string;

  @ApiProperty()
  @IsString()
  phone!: string;

  @ApiProperty({ description: 'BusinessCategory slug, e.g. "tiendas", "veterinarios"' })
  @IsString()
  categorySlug!: string;

  @ApiProperty({
    type: [String],
    description:
      'PetSpecies slugs this business caters to (e.g. ["perro","gato"]) — the species-match ' +
      'signal BusinessRankingService uses to recommend it to customers by their pets, independent ' +
      'of whatever products/services it lists later.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  speciesSlugs!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsString()
  addressLine!: string;

  @ApiProperty()
  @IsString()
  city!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @ApiProperty({
    description:
      '"¿Quieres vender productos a través de BINGO+?" — the single onboarding question that ' +
      'decides the SELLS_PRODUCTS capability (Marketplace eligibility). false means Directory-only.',
  })
  @IsBoolean()
  sellsProducts!: boolean;

  @ApiPropertyOptional({ description: 'Only meaningful when sellsProducts is true' })
  @IsOptional()
  @IsBoolean()
  deliveryEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Only meaningful when sellsProducts is true' })
  @IsOptional()
  @IsBoolean()
  pickupEnabled?: boolean;

  @ApiPropertyOptional({
    description:
      'Only asked when sellsProducts is false — a SELLS_PRODUCTS business already pays BINGO+ ' +
      'via marketplace commission (product sales + rider delivery fee) and gets Directory presence ' +
      'for free, no plan needed. A directory-only business has no other revenue line for BINGO+, so ' +
      'it must choose a paid membership plan to be listed.',
  })
  @IsOptional()
  @IsBoolean()
  directoryListing?: boolean;

  @ApiPropertyOptional({ description: 'Required when directoryListing is true and sellsProducts is false' })
  @IsOptional()
  @IsString()
  membershipPlanId?: string;

  @ApiPropertyOptional({ description: 'Optional admin discount code to apply to the new membership' })
  @IsOptional()
  @IsString()
  couponCode?: string;
}
