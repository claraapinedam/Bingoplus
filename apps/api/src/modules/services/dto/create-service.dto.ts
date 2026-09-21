import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceType, ServiceLocationType } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUrl, Min, MinLength } from 'class-validator';

export const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export class CreateServiceDto {
  @ApiProperty({ enum: ServiceType })
  @IsEnum(ServiceType)
  type!: ServiceType;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  durationMinutes!: number;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Only meaningful for DAYCARE/BOARDING — weekday keys the service actually operates ' +
      '(e.g. ["mon","tue","wed","thu","fri"]). Ignored for every other ServiceType.',
  })
  @IsOptional()
  @IsArray()
  @IsIn(WEEKDAY_KEYS, { each: true })
  operatingDays?: string[];

  @ApiPropertyOptional({ description: 'Max simultaneous bookings per slot — defaults to 1 (single-provider) if omitted' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requirements?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minAgeMonths?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxAgeMonths?: number;

  @ApiPropertyOptional({
    type: [String],
    description: 'PetSpecies slugs this service applies to, e.g. ["dog","cat"] — omit/empty means it applies to every species.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  speciesSlugs?: string[];

  @ApiPropertyOptional({
    enum: ServiceLocationType,
    description:
      'Where the service is rendered. Only settable to AT_CUSTOMER_HOME/BOTH while the business ' +
      'has the HOME_SERVICE capability enabled — ServicesService forces AT_BUSINESS otherwise.',
  })
  @IsOptional()
  @IsEnum(ServiceLocationType)
  locationType?: ServiceLocationType;
}
