import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { BillingFrequency, MembershipPlanStatus } from '@prisma/client';
import { IsArray, IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateMembershipPlanDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiPropertyOptional({ default: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ enum: BillingFrequency })
  @IsEnum(BillingFrequency)
  billingFrequency!: BillingFrequency;

  @ApiPropertyOptional({ description: 'Configurable — never hardcoded (spec §12)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  trialDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  benefits?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [String], description: 'BusinessCategory slugs this plan applies to — empty means all' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applicableCategories?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ enum: MembershipPlanStatus, description: 'Defaults to ACTIVE on create' })
  @IsOptional()
  @IsEnum(MembershipPlanStatus)
  status?: MembershipPlanStatus;
}

export class UpdateMembershipPlanDto extends PartialType(CreateMembershipPlanDto) {}
