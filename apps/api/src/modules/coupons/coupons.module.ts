import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import {
  PublicBusinessCouponsController,
  PublicCouponsController,
  PublicOffersController,
  CustomerCouponsController,
  BusinessCouponsController,
} from './coupons.controller';
import { CouponsService } from './coupons.service';
import { BusinessCapabilitiesModule } from '../business-capabilities/business-capabilities.module';
import { MembershipsModule } from '../memberships/memberships.module';

@Module({
  imports: [JwtModule.register({}), BusinessCapabilitiesModule, MembershipsModule],
  controllers: [
    PublicBusinessCouponsController,
    PublicCouponsController,
    PublicOffersController,
    CustomerCouponsController,
    BusinessCouponsController,
  ],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}
