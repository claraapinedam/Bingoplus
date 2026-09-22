import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsString } from 'class-validator';

/** Selected payee ids from the admin "Pagos" list (one row per rider, or per business — never a
 * RiderEarning/Order id directly, see PayoutsService for why). */
export class MarkPayoutsPaidDto {
  @ApiProperty({ type: [String], description: 'Rider ids (or business ids) selected in the admin Pagos list.' })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ids!: string[];
}
