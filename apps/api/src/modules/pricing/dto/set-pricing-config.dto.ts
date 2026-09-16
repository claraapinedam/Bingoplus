import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class SetPricingConfigDto {
  @ApiProperty({ description: 'e.g. 0.05 for 5%' })
  @IsNumber()
  @Min(0)
  platformFeePercent!: number;

  @ApiProperty({ description: 'e.g. 0.03 for 3%' })
  @IsNumber()
  @Min(0)
  serviceFeePercent!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  serviceFeeFixed!: number;

  @ApiProperty({ description: 'e.g. 0.12 for 12% — MVP flat rate, see TaxCalculationService' })
  @IsNumber()
  @Min(0)
  defaultTaxPercent!: number;

  @ApiProperty({ description: 'Fallback delivery fee when a business has not set its own' })
  @IsNumber()
  @Min(0)
  defaultDeliveryFee!: number;
}
