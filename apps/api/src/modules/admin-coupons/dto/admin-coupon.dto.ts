import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { AdminCouponType } from '@prisma/client';
import { IsArray, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateAdminCouponDto {
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

  @ApiProperty({ enum: AdminCouponType })
  @IsEnum(AdminCouponType)
  discountType!: AdminCouponType;

  @ApiPropertyOptional({ description: 'For PERCENTAGE_DISCOUNT/FIXED_AMOUNT_DISCOUNT' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountValue?: number;

  @ApiPropertyOptional({ description: 'For FREE_MONTHS' })
  @IsOptional()
  @IsInt()
  @Min(1)
  freeMonths?: number;

  @ApiProperty()
  @IsDateString()
  startDate!: string;

  @ApiProperty()
  @IsDateString()
  expirationDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  usagePerBusiness?: number;

  @ApiPropertyOptional({ type: [String], description: 'MembershipPlan ids — empty means all plans' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicablePlans?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  termsAndConditions?: string;
}

export class UpdateAdminCouponDto extends PartialType(CreateAdminCouponDto) {}
