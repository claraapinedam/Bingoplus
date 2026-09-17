import { ApiPropertyOptional } from '@nestjs/swagger';
import { PetFriendlyPlaceCategory, PetFriendlyPlaceStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ListPetFriendlyPlacesQueryDto {
  @ApiPropertyOptional({ enum: PetFriendlyPlaceCategory })
  @IsOptional()
  @IsEnum(PetFriendlyPlaceCategory)
  category?: PetFriendlyPlaceCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

export class ListAdminPetFriendlyPlacesQueryDto extends ListPetFriendlyPlacesQueryDto {
  @ApiPropertyOptional({ enum: PetFriendlyPlaceStatus })
  @IsOptional()
  @IsEnum(PetFriendlyPlaceStatus)
  status?: PetFriendlyPlaceStatus;
}
