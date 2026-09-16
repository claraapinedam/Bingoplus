import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethodType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

/**
 * §17: only what the provider hands back after tokenizing on the client is ever stored here —
 * never a full card number, CVV, or PIN. `providerToken` is the opaque provider reference
 * (e.g. a Stripe PaymentMethod id), not a raw card credential.
 */
export class CreatePaymentMethodDto {
  @ApiProperty()
  @IsString()
  provider!: string;

  @ApiProperty({ enum: PaymentMethodType })
  @IsEnum(PaymentMethodType)
  type!: PaymentMethodType;

  @ApiProperty()
  @IsString()
  providerToken!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  last4?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
