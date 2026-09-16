import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductTaxCategory } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  MinLength,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'ProductCategory slug, e.g. "alimento", "juguetes"' })
  @IsString()
  categorySlug!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiPropertyOptional({ description: 'If set and lower than price, shown as the active selling price' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salePrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({
    enum: ProductTaxCategory,
    default: ProductTaxCategory.STANDARD,
    description:
      'IVA classification (Ecuador SRI): STANDARD is taxed at the current general rate, ZERO at 0%.',
  })
  @IsOptional()
  @IsEnum(ProductTaxCategory)
  taxCategory?: ProductTaxCategory;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weight?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsUrl({ require_tld: false }, { each: true })
  images?: string[];

  @ApiPropertyOptional({
    type: [String],
    description:
      'PetSpecies slugs this product is recommended for, e.g. ["dog","cat"] — feeds the marketplace ranking (BusinessRankingService).',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  speciesSlugs?: string[];
}
