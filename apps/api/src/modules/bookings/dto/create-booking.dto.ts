import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateBookingDto {
  @ApiProperty()
  @IsString()
  serviceId!: string;

  @ApiProperty({ description: 'The pet this booking is for — required, only pets eligible for the service are accepted' })
  @IsString()
  petId!: string;

  @ApiProperty({ description: 'Calendar date, e.g. "2026-09-20" — for DAYCARE/BOARDING this is the check-in date' })
  @IsDateString({ strict: true })
  date!: string;

  @ApiPropertyOptional({
    description:
      '24h "HH:MM", must be one of the slots returned by the availability endpoint. Required for every ' +
      'ServiceType except DAYCARE/BOARDING, which use checkOutDate instead.',
  })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'startTime must be in HH:MM 24h format' })
  startTime?: string;

  @ApiPropertyOptional({ description: 'DAYCARE/BOARDING only — the check-out date, e.g. "2026-09-25". Required for those two types.' })
  @IsOptional()
  @IsDateString({ strict: true })
  checkOutDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({
    description:
      'Only required when the service\'s locationType is BOTH — whether the customer wants the ' +
      'provider to come to their home instead of visiting the business. Ignored (forced by the ' +
      'service\'s own locationType) for AT_BUSINESS/AT_CUSTOMER_HOME services.',
  })
  @IsOptional()
  @IsBoolean()
  atCustomerHome?: boolean;

  @ApiProperty({ description: 'Client-generated key — a retried "Reservar" double-tap with the same key returns the original booking' })
  @IsString()
  idempotencyKey!: string;
}
