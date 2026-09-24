import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsOptional } from 'class-validator';

/** Optional customer coordinates, shared by any public detail endpoint that wants to surface a
 * "X min de distancia" reference — mirrors ListDirectoryQueryDto's lat/lng exactly. */
export class GeoQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;
}
