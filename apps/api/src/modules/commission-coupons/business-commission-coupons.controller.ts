import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BusinessOwnershipGuard } from '../../common/guards/business-ownership.guard';
import { CommissionCouponsService } from './commission-coupons.service';
import { RedeemCommissionCouponDto } from './dto/redeem-commission-coupon.dto';

@ApiTags('me/business/commission-coupons')
@UseGuards(BusinessOwnershipGuard)
@Controller('me/business/:businessId/commission-coupons')
export class BusinessCommissionCouponsController {
  constructor(private readonly commissionCoupons: CommissionCouponsService) {}

  @Post('redeem')
  redeem(@Param('businessId') businessId: string, @Body() dto: RedeemCommissionCouponDto) {
    return this.commissionCoupons.redeemForBusiness(businessId, dto.code);
  }
}
