import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

// Delivery/pickup moved to BusinessCapability (PATCH /me/business/:id/capabilities) — they're
// operational toggles, not core business record fields, per the capabilities-vs-category
// separation (RULE 2/3).
export class UpdateBusinessDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tradeName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @ApiPropertyOptional({
    description: 'Record<weekday, {open, close}> — e.g. {"mon":{"open":"09:00","close":"18:00"}}',
  })
  @IsOptional()
  openingHours?: Record<string, { open: string; close: string }>;

  @ApiPropertyOptional({ description: 'Only meaningful once the DELIVERY capability is enabled' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryFeeUsd?: number;

  @ApiPropertyOptional({ description: 'Only meaningful once the DELIVERY capability is enabled' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryEstimateMinutes?: number;
}
