import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateBookingPaymentDto {
  @ApiProperty({ description: 'Client-generated — a retried request with the same key never double-charges' })
  @IsString()
  idempotencyKey!: string;
}

export class ConfirmBookingPaymentDto {
  @ApiPropertyOptional({
    description: 'Sandbox-only test hook — forces the simulated payment to fail instead of succeed',
  })
  @IsOptional()
  @IsBoolean()
  simulateFailure?: boolean;
}
