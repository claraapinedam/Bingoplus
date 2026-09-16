import { Module } from '@nestjs/common';
import { ServicesService } from './services.service';
import { PublicServicesController, BusinessServicesController } from './services.controller';

@Module({
  controllers: [PublicServicesController, BusinessServicesController],
  providers: [ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}
