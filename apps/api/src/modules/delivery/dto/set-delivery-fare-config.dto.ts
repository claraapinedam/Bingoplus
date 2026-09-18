import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, Max, Min } from 'class-validator';

export class SetDeliveryFareConfigDto {
  @ApiProperty({ description: 'Minimum fare (USD) during the day window' })
  @IsNumber()
  @Min(0)
  minFareDay!: number;

  @ApiProperty({ description: 'Minimum fare (USD) during the night window' })
  @IsNumber()
  @Min(0)
  minFareNight!: number;

  @ApiProperty({ description: 'Local hour (business timezone, 0-23) the night rate starts, e.g. 20 = 8pm' })
  @IsInt()
  @Min(0)
  @Max(23)
  nightStartHour!: number;

  @ApiProperty({ description: 'Local hour (business timezone, 0-23) the night rate ends, e.g. 6 = 6am' })
  @IsInt()
  @Min(0)
  @Max(23)
  nightEndHour!: number;

  @ApiProperty({ description: 'USD per km' })
  @IsNumber()
  @Min(0)
  perKmRate!: number;

  @ApiProperty({ description: 'USD per estimated minute' })
  @IsNumber()
  @Min(0)
  perMinuteRate!: number;

  @ApiProperty({ description: 'Ratio of deliveries awaiting a rider to available riders at/above which surge applies, e.g. 2' })
  @IsNumber()
  @Min(0)
  surgeThreshold!: number;

  @ApiProperty({ description: 'Multiplier applied to the whole fare once surgeThreshold is met — 1 = no surge' })
  @IsNumber()
  @Min(1)
  surgeMultiplier!: number;

  @ApiProperty({ description: 'e.g. 0.2 for 20% — the share of the fare BINGO+ keeps' })
  @IsNumber()
  @Min(0)
  @Max(1)
  bingoCommissionPercent!: number;

  @ApiProperty({ description: 'e.g. 0.08 for 8% — withheld from the rider on top of the BINGO+ commission' })
  @IsNumber()
  @Min(0)
  @Max(1)
  riderTaxWithholdingPercent!: number;
}
