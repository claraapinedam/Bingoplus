import { ApiProperty } from '@nestjs/swagger';
import { FavoriteTargetType } from '@prisma/client';
import { IsEnum, IsString } from 'class-validator';

export class ToggleFavoriteDto {
  @ApiProperty({ enum: FavoriteTargetType })
  @IsEnum(FavoriteTargetType)
  targetType!: FavoriteTargetType;

  @ApiProperty()
  @IsString()
  targetId!: string;
}
