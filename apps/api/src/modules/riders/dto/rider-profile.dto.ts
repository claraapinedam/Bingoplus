import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RiderAvailabilityStatus, RiderDocumentType, VehicleType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';

export class UpdateRiderProfileDto {
  @ApiPropertyOptional({ description: 'Simple zone signal for eligibility filtering (§18)' })
  @IsOptional()
  @IsString()
  city?: string;
}

export class SetAvailabilityDto {
  @ApiProperty({ enum: RiderAvailabilityStatus })
  @IsEnum(RiderAvailabilityStatus)
  availabilityStatus!: RiderAvailabilityStatus;
}

export class UpdateLocationDto {
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
}

export class AddVehicleDto {
  @ApiProperty({ enum: VehicleType })
  @IsEnum(VehicleType)
  type!: VehicleType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  plate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;
}

export class AddDocumentDto {
  @ApiProperty({ enum: RiderDocumentType })
  @IsEnum(RiderDocumentType)
  type!: RiderDocumentType;

  @ApiProperty()
  @IsUrl({ require_tld: false })
  fileUrl!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  documentNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expirationDate?: string;
}
