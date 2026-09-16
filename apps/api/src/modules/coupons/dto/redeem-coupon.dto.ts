import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class RedeemCouponDto {
  @ApiProperty({ description: 'The signed token from the customer\'s QR — see CouponsService.requestRedemptionToken' })
  @IsString()
  token!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  purchaseAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  petId?: string;
}
