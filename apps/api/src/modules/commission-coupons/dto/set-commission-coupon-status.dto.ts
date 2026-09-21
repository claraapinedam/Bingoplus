import { ApiProperty } from '@nestjs/swagger';
import { AdminCouponStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class SetCommissionCouponStatusDto {
  @ApiProperty({ enum: AdminCouponStatus })
  @IsEnum(AdminCouponStatus)
  status!: AdminCouponStatus;
}
