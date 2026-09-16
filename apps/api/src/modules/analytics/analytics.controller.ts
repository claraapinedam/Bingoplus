import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BusinessOwnershipGuard } from '../../common/guards/business-ownership.guard';
import { BusinessAnalyticsService } from './business-analytics.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

@ApiTags('business/analytics')
@UseGuards(BusinessOwnershipGuard)
@Controller('business/:businessId/analytics')
export class BusinessAnalyticsController {
  constructor(private readonly analytics: BusinessAnalyticsService) {}

  @Get()
  get(@Param('businessId') businessId: string, @Query() query: AnalyticsQueryDto) {
    return this.analytics.getAnalytics(businessId, query);
  }
}
