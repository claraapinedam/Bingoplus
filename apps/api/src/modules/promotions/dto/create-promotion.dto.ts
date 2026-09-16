import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PromotionTargetType, PromotionType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class PromotionTargetInputDto {
  @ApiProperty({ enum: PromotionTargetType })
  @IsEnum(PromotionTargetType)
  targetType!: PromotionTargetType;

  @ApiPropertyOptional({ description: 'Product/ProductCategory/Service id — omit for BUSINESS (the promotion\'s own business is used).' })
  @IsOptional()
  @IsString()
  targetId?: string;
}

export class CreatePromotionDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: PromotionType })
  @IsEnum(PromotionType)
  type!: PromotionType;

  @ApiProperty({ description: 'PERCENTAGE: 0-100. FIXED_AMOUNT: a currency amount.' })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  value!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimumPurchase?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maximumDiscount?: number;

  @ApiProperty()
  @IsDateString()
  startDate!: string;

  @ApiProperty()
  @IsDateString()
  endDate!: string;

  @ApiProperty({ type: [PromotionTargetInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PromotionTargetInputDto)
  targets!: PromotionTargetInputDto[];
}
