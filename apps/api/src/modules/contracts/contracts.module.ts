import { Module } from '@nestjs/common';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { RiderContractsController } from './rider-contracts.controller';
import { RiderContractsService } from './rider-contracts.service';
import { ContractTemplateService } from './contract-template.service';
import { LegalInfoService } from './legal-info.service';
import { PublicLegalInfoController } from './public-legal-info.controller';
import { EmailModule } from '../email/email.module';
import { UploadsModule } from '../uploads/uploads.module';
import { BusinessCapabilitiesModule } from '../business-capabilities/business-capabilities.module';
import { DeliveryFareModule } from '../delivery/delivery-fare.module';

@Module({
  imports: [EmailModule, UploadsModule, BusinessCapabilitiesModule, DeliveryFareModule],
  controllers: [ContractsController, RiderContractsController, PublicLegalInfoController],
  providers: [ContractsService, RiderContractsService, ContractTemplateService, LegalInfoService],
  exports: [ContractsService, RiderContractsService, ContractTemplateService, LegalInfoService],
})
export class ContractsModule {}
