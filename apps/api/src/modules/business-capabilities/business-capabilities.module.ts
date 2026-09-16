import { Module } from '@nestjs/common';
import { BusinessCapabilitiesService } from './business-capabilities.service';

@Module({
  providers: [BusinessCapabilitiesService],
  exports: [BusinessCapabilitiesService],
})
export class BusinessCapabilitiesModule {}
