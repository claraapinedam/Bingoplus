import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PetFriendlyPlaceCategory } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUrl, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreatePetFriendlyPlaceDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: PetFriendlyPlaceCategory })
  @IsEnum(PetFriendlyPlaceCategory)
  category!: PetFriendlyPlaceCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ description: 'Full address, as picked from the Google Places autocomplete' })
  @IsString()
  @MinLength(3)
  address!: string;

  @ApiProperty()
  @Type(() => Number)
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty()
  @Type(() => Number)
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiPropertyOptional({ description: 'URL returned by POST /uploads' })
  @IsOptional()
  // @IsOptional() only skips validation for null/undefined, not '' — see the same fix on
  // CreateServiceDto.imageUrl for why this needs an explicit empty-string guard.
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUrl({ require_tld: false })
  photoUrl?: string;
}
