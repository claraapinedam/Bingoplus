import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Business-entered manual block — an off-platform appointment (phone call, walk-in) the business
 * logs so it isn't accidentally double-booked online. Goes through the exact same row-locked
 * capacity check as a real app booking (see BookingsService.createManualBlock), so it genuinely
 * competes for the service's capacity rather than being a second, disconnected concept.
 */
export class CreateManualBookingBlockDto {
  @ApiProperty()
  @IsString()
  serviceId!: string;

  @ApiProperty({ description: 'Calendar date, e.g. "2026-09-20" — for DAYCARE/BOARDING this is the check-in date' })
  @IsDateString({ strict: true })
  date!: string;

  @ApiPropertyOptional({
    description: '24h "HH:MM" — required for every ServiceType except DAYCARE/BOARDING. Unlike an app booking, ' +
      'not constrained to the service\'s duration grid: a manual block can start/end at any time.',
  })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'startTime must be in HH:MM 24h format' })
  startTime?: string;

  @ApiPropertyOptional({ description: 'Required alongside startTime for every ServiceType except DAYCARE/BOARDING.' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'endTime must be in HH:MM 24h format' })
  endTime?: string;

  @ApiPropertyOptional({ description: 'DAYCARE/BOARDING only — the check-out date, e.g. "2026-09-25". Required for those two types.' })
  @IsOptional()
  @IsDateString({ strict: true })
  checkOutDate?: string;

  @ApiPropertyOptional({ description: 'Free text — e.g. "Reservado por teléfono a nombre de Juan Pérez"' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
