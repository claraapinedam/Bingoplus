import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InventoryReason } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateStockDto {
  @ApiProperty({ description: 'Positive to add stock, negative to remove it' })
  @IsInt()
  quantityChange!: number;

  @ApiProperty({ enum: InventoryReason })
  @IsEnum(InventoryReason)
  reason!: InventoryReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
