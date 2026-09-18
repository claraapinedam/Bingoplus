import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import {
  BusinessCouponStatus,
  BusinessStatus,
  DeliveryStatus,
  OrderStatus,
  PaymentStatus,
  ProductStatus,
  ReviewReportStatus,
  ReviewStatus,
  ReviewTargetType,
  RiderAccountStatus,
} from '@prisma/client';

export class ListUsersQueryDto {
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

export class ListBusinessesQueryDto extends ListUsersQueryDto {
  @ApiPropertyOptional({ enum: BusinessStatus })
  @IsOptional()
  @IsEnum(BusinessStatus)
  status?: BusinessStatus;
}

export class ListRidersQueryDto extends ListUsersQueryDto {
  @ApiPropertyOptional({ enum: RiderAccountStatus })
  @IsOptional()
  @IsEnum(RiderAccountStatus)
  status?: RiderAccountStatus;
}

export class ListOrdersAdminQueryDto extends ListUsersQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessId?: string;

  @ApiPropertyOptional({ description: 'Filters on Order.createdAt — a date-only string means the whole day, a full datetime an exact bound' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Filters on Order.createdAt — a date-only string means the whole day, a full datetime an exact bound' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class ListProductsAdminQueryDto extends ListUsersQueryDto {
  @ApiPropertyOptional({ enum: ProductStatus })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessId?: string;
}

export class ListPaymentsAdminQueryDto extends ListUsersQueryDto {
  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessId?: string;

  @ApiPropertyOptional({ description: 'Filters on Payment.createdAt — a date-only string means the whole day, a full datetime an exact bound' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Filters on Payment.createdAt — a date-only string means the whole day, a full datetime an exact bound' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class ListBusinessCouponsAdminQueryDto extends ListUsersQueryDto {
  @ApiPropertyOptional({ enum: BusinessCouponStatus })
  @IsOptional()
  @IsEnum(BusinessCouponStatus)
  status?: BusinessCouponStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessId?: string;
}

export class ListDeliveriesAdminQueryDto {
  @ApiPropertyOptional({ enum: DeliveryStatus })
  @IsOptional()
  @IsEnum(DeliveryStatus)
  status?: DeliveryStatus;
}

export class ListAuditLogsQueryDto extends ListUsersQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actorUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  action?: string;
}

export class ListAdminReviewsQueryDto {
  @ApiPropertyOptional({ enum: ReviewStatus })
  @IsOptional()
  @IsEnum(ReviewStatus)
  status?: ReviewStatus;

  @ApiPropertyOptional({ enum: ReviewTargetType })
  @IsOptional()
  @IsEnum(ReviewTargetType)
  targetType?: ReviewTargetType;

  @ApiPropertyOptional({ description: 'Scope to one specific target entity (e.g. one PetFriendlyPlace id) — combine with targetType.' })
  @IsOptional()
  @IsString()
  targetId?: string;

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

export class ListAdminReviewReportsQueryDto {
  @ApiPropertyOptional({ enum: ReviewReportStatus })
  @IsOptional()
  @IsEnum(ReviewReportStatus)
  status?: ReviewReportStatus;

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
