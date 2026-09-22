import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

/** Item-level selection inside one payee's Pendiente tab — RiderEarning ids or Order ids, never
 * mixed, always scoped server-side to the :riderId/:businessId in the route. */
export class MarkPayoutItemsPaidDto {
  @ApiProperty({ type: [String], description: 'Ids of the pending earnings (rider) or orders (business) selected to pay.' })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ids!: string[];

  @ApiPropertyOptional({ description: 'Optional bank/transfer reference — can also be added later from the Historial tab.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceNumber?: string;
}
