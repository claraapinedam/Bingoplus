import { Module } from '@nestjs/common';
import { ServicesService } from './services.service';
import { PublicServicesController, BusinessServicesController } from './services.controller';
import { BusinessCapabilitiesModule } from '../business-capabilities/business-capabilities.module';

@Module({
  imports: [BusinessCapabilitiesModule],
  controllers: [PublicServicesController, BusinessServicesController],
  providers: [ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}
