import { Module } from '@nestjs/common';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { EmailModule } from '../email/email.module';
import { UploadsModule } from '../uploads/uploads.module';
import { BusinessCapabilitiesModule } from '../business-capabilities/business-capabilities.module';

@Module({
  imports: [EmailModule, UploadsModule, BusinessCapabilitiesModule],
  controllers: [ContractsController],
  providers: [ContractsService],
  exports: [ContractsService],
})
export class ContractsModule {}
