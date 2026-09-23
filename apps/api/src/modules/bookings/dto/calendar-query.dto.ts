import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

/** Drives the business Reservas calendar (day/week/month, default week) — see BookingsService.getCalendar. */
export class CalendarQueryDto {
  @ApiProperty({ description: 'Start of the visible range, inclusive, e.g. "2026-09-20"' })
  @IsDateString({ strict: true })
  from!: string;

  @ApiProperty({ description: 'End of the visible range, inclusive, e.g. "2026-09-26". Max 31 days after `from`.' })
  @IsDateString({ strict: true })
  to!: string;

  @ApiPropertyOptional({ description: 'Restrict to a single service — omit to see every active service.' })
  @IsOptional()
  @IsString()
  serviceId?: string;
}
