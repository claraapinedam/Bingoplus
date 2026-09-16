import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateBookingDto {
  @ApiProperty()
  @IsString()
  serviceId!: string;

  @ApiProperty({ description: 'The pet this booking is for — required, only pets eligible for the service are accepted' })
  @IsString()
  petId!: string;

  @ApiProperty({ description: 'Calendar date, e.g. "2026-09-20"' })
  @IsDateString({ strict: true })
  date!: string;

  @ApiProperty({ description: '24h "HH:MM", must be one of the slots returned by the availability endpoint' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'startTime must be in HH:MM 24h format' })
  startTime!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiProperty({ description: 'Client-generated key — a retried "Reservar" double-tap with the same key returns the original booking' })
  @IsString()
  idempotencyKey!: string;
}
