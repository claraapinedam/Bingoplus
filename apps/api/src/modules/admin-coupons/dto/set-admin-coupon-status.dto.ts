import { ApiProperty } from '@nestjs/swagger';
import { AdminCouponStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class SetAdminCouponStatusDto {
  @ApiProperty({ enum: AdminCouponStatus })
  @IsEnum(AdminCouponStatus)
  status!: AdminCouponStatus;
}
