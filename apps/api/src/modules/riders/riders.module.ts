import { Module } from '@nestjs/common';
import { DeliveryModule } from '../delivery/delivery.module';
import { RidersService } from './riders.service';
import { RiderProfileService } from './rider-profile.service';
import { RiderProfileController } from './rider-profile.controller';
import { RiderApplicationController } from './rider-application.controller';

@Module({
  imports: [DeliveryModule],
  controllers: [RiderProfileController, RiderApplicationController],
  providers: [RidersService, RiderProfileService],
  exports: [RidersService, RiderProfileService],
})
export class RidersModule {}
