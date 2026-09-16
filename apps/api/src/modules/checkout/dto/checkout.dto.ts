import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FulfillmentType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class CheckoutValidateDto {
  @ApiProperty({ enum: FulfillmentType })
  @IsEnum(FulfillmentType)
  fulfillmentType!: FulfillmentType;

  @ApiPropertyOptional({ description: 'Required when fulfillmentType is DELIVERY' })
  @IsOptional()
  @IsString()
  addressId?: string;
}

export class CreatePaymentDto extends CheckoutValidateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ description: 'Client-generated — a retried request with the same key never double-charges' })
  @IsString()
  idempotencyKey!: string;
}

export class ConfirmPaymentDto {
  @ApiProperty()
  @IsString()
  paymentId!: string;

  @ApiPropertyOptional({
    description: 'Sandbox-only test hook — forces the simulated payment to fail instead of succeed',
  })
  @IsOptional()
  @IsBoolean()
  simulateFailure?: boolean;
}
