import { ApiPropertyOptional } from '@nestjs/swagger';
import { DateRangePreset } from '@bingoplus/utils';
import { IsDateString, IsIn, IsOptional } from 'class-validator';

const PRESETS: DateRangePreset[] = ['today', 'last_7_days', 'last_30_days', 'this_month', 'last_month', 'custom'];

export class AnalyticsQueryDto {
  @ApiPropertyOptional({ enum: PRESETS })
  @IsOptional()
  @IsIn(PRESETS)
  preset?: DateRangePreset;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;
}
