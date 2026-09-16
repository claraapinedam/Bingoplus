import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';

const SIMULATABLE_STATUSES = ['PENDING', 'REQUIRES_ACTION', 'AUTHORIZED', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED'] as const;

export class SimulateSandboxWebhookDto {
  @ApiProperty()
  @IsString()
  paymentId!: string;

  @ApiProperty({ enum: SIMULATABLE_STATUSES })
  @IsEnum(SIMULATABLE_STATUSES)
  status!: (typeof SIMULATABLE_STATUSES)[number];
}
