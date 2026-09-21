import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RedeemCommissionCouponDto {
  @ApiProperty()
  @IsString()
  code!: string;
}
