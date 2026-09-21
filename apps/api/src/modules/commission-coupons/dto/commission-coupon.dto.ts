import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CommissionCouponTargetType } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateCommissionCouponDto {
  @ApiProperty()
  @IsString()
  code!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: CommissionCouponTargetType })
  @IsEnum(CommissionCouponTargetType)
  targetType!: CommissionCouponTargetType;

  @ApiProperty({ description: 'The reduced rate BINGO+ keeps once redeemed, e.g. 0.10 for 10% (default is usually higher)' })
  @IsNumber()
  @Min(0)
  @Max(1)
  commissionPercent!: number;

  @ApiProperty()
  @IsDateString()
  startDate!: string;

  @ApiProperty({ description: 'Also when the discount itself expires for anyone who already redeemed — a shared campaign window, not a per-redeemer duration' })
  @IsDateString()
  expirationDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimit?: number;
}

export class UpdateCommissionCouponDto extends PartialType(CreateCommissionCouponDto) {}
