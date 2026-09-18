import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryIncidentType, DeliveryStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class RejectDeliveryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class CompleteDeliveryDto {
  @ApiProperty({ description: 'The OTP code the customer reads out (§31)' })
  @IsString()
  otpCode!: string;
}

export class ReportIncidentDto {
  @ApiProperty({ enum: DeliveryIncidentType })
  @IsEnum(DeliveryIncidentType)
  type!: DeliveryIncidentType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class RiderLocationUpdateDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  heading?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  speed?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  accuracy?: number;
}

export class AdminCancelDeliveryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class AdminAssignDeliveryDto {
  @ApiProperty()
  @IsString()
  riderId!: string;
}

export class ListDeliveriesQueryDto {
  @ApiPropertyOptional({ enum: DeliveryStatus })
  @IsOptional()
  @IsEnum(DeliveryStatus)
  status?: DeliveryStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  riderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'Filters on Delivery.createdAt — a date-only string means the whole day, a full datetime an exact bound' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Filters on Delivery.createdAt — a date-only string means the whole day, a full datetime an exact bound' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
