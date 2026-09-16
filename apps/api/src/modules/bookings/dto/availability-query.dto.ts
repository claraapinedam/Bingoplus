import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class AvailabilityQueryDto {
  @ApiProperty({ description: 'Calendar date, e.g. "2026-09-20"' })
  @IsDateString({ strict: true })
  date!: string;
}
