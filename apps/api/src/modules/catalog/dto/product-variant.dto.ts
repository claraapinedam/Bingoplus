import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateProductVariantDto {
  @ApiProperty({ description: 'e.g. "Talla M", "Rojo"' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ description: 'Must be unique across the whole catalog' })
  @IsString()
  @MinLength(1)
  sku!: string;

  @ApiPropertyOptional({ description: 'Added to the product price for this variant' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  priceDelta?: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock!: number;
}

export class UpdateProductVariantDto extends PartialType(CreateProductVariantDto) {}
