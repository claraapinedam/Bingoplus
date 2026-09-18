import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';

export class SetDefaultCommissionRateDto {
  @ApiProperty({ description: 'e.g. 0.15 for 15% — used when approving a business without an explicit rate' })
  @IsNumber()
  @Min(0)
  @Max(1)
  rate!: number;
}
