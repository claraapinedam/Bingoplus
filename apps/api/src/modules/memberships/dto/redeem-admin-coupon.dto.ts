import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RedeemAdminCouponDto {
  @ApiProperty()
  @IsString()
  code!: string;
}
