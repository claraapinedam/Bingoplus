import { Module } from '@nestjs/common';
import { BusinessCapabilitiesModule } from '../business-capabilities/business-capabilities.module';
import { BusinessAnalyticsService } from './business-analytics.service';
import { AdminAnalyticsService } from './admin-analytics.service';
import { BusinessAnalyticsController } from './analytics.controller';

@Module({
  imports: [BusinessCapabilitiesModule],
  controllers: [BusinessAnalyticsController],
  providers: [BusinessAnalyticsService, AdminAnalyticsService],
  exports: [BusinessAnalyticsService, AdminAnalyticsService],
})
export class AnalyticsModule {}
