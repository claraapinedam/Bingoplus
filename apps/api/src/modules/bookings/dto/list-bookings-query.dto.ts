import { ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ListCustomerBookingsQueryDto {
  @ApiPropertyOptional({ enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;
}

export class ListBusinessBookingsQueryDto {
  @ApiPropertyOptional({ enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @ApiPropertyOptional({ description: 'Single calendar date, e.g. "2026-09-20" — for the daily agenda view. Ignored if `from`/`to` are given.' })
  @IsOptional()
  @IsDateString({ strict: true })
  date?: string;

  // A single `date` alone defaulted every business's Reservas screen to "today only," which is how
  // a booking made today for a later date went unnoticed until the customer's arrival — a range
  // (or neither bound at all, for "show me everything") lets the business actually see what's coming.
  @ApiPropertyOptional({ description: 'Start of a date range, inclusive — e.g. "2026-09-20". Omit both `from`/`to` to see every date.' })
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @ApiPropertyOptional({ description: 'End of a date range, inclusive.' })
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}

export class ListAdminBookingsQueryDto {
  @ApiPropertyOptional({ enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

export class CancelBookingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
