import { ApiPropertyOptional } from '@nestjs/swagger';
import { FavoriteTargetType } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ListFavoritesQueryDto {
  @ApiPropertyOptional({ enum: FavoriteTargetType })
  @IsOptional()
  @IsEnum(FavoriteTargetType)
  targetType?: FavoriteTargetType;
}
