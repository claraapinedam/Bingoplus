import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class ApproveBusinessDto {
  @ApiPropertyOptional({ description: 'Commission rate as a fraction, e.g. 0.15 for 15%' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  commissionRate?: number;
}

export class RejectBusinessDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class SuspendBusinessDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
