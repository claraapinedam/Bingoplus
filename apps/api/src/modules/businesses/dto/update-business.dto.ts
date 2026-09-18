import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

// Delivery/pickup moved to BusinessCapability (PATCH /me/business/:id/capabilities) — they're
// operational toggles, not core business record fields, per the capabilities-vs-category
// separation (RULE 2/3). Delivery is priced by DeliveryFareConfig (Admin-owned, an agreement with
// the Rider) — a business never sets its own delivery fee/estimate.
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
}
