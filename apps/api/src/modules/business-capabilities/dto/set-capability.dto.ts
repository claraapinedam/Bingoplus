import { ApiProperty } from '@nestjs/swagger';
import { BusinessCapabilityType } from '@prisma/client';
import { IsBoolean, IsEnum } from 'class-validator';

export class SetCapabilityDto {
  @ApiProperty({ enum: BusinessCapabilityType })
  @IsEnum(BusinessCapabilityType)
  capability!: BusinessCapabilityType;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}
