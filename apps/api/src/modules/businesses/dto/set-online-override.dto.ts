import { ApiPropertyOptional } from '@nestjs/swagger';
import { BusinessOnlineOverride } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

// `override: null` (or omitted) means "volver a automático" — clears the manual override and goes
// back to following Business.openingHours. `override: 'ONLINE' | 'OFFLINE'` forces that state
// regardless of the configured schedule, until explicitly changed again (see the persistence
// comment on Business.manualOverride in schema.prisma).
export class SetOnlineOverrideDto {
  @ApiPropertyOptional({ enum: BusinessOnlineOverride, nullable: true })
  @IsOptional()
  @IsEnum(BusinessOnlineOverride)
  override?: BusinessOnlineOverride | null;
}
