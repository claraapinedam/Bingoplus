import { Module } from '@nestjs/common';
import { CommissionCouponsController } from './commission-coupons.controller';
import { BusinessCommissionCouponsController } from './business-commission-coupons.controller';
import { RiderCommissionCouponsController } from './rider-commission-coupons.controller';
import { CommissionCouponsService } from './commission-coupons.service';

@Module({
  controllers: [CommissionCouponsController, BusinessCommissionCouponsController, RiderCommissionCouponsController],
  providers: [CommissionCouponsService],
})
export class CommissionCouponsModule {}
