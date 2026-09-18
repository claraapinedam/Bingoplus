import { Module } from '@nestjs/common';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { RiderContractsController } from './rider-contracts.controller';
import { RiderContractsService } from './rider-contracts.service';
import { EmailModule } from '../email/email.module';
import { UploadsModule } from '../uploads/uploads.module';
import { BusinessCapabilitiesModule } from '../business-capabilities/business-capabilities.module';
import { DeliveryFareModule } from '../delivery/delivery-fare.module';

@Module({
  imports: [EmailModule, UploadsModule, BusinessCapabilitiesModule, DeliveryFareModule],
  controllers: [ContractsController, RiderContractsController],
  providers: [ContractsService, RiderContractsService],
  exports: [ContractsService, RiderContractsService],
})
export class ContractsModule {}
