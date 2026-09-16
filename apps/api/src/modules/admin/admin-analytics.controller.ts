import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminAnalyticsService } from '../analytics/admin-analytics.service';
import { AnalyticsQueryDto } from '../analytics/dto/analytics-query.dto';

@ApiTags('admin/analytics')
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
@UseGuards(RolesGuard)
@Controller('admin/analytics')
export class AdminAnalyticsController {
  constructor(private readonly analytics: AdminAnalyticsService) {}

  @Get()
  get(@Query() query: AnalyticsQueryDto) {
    return this.analytics.getAnalytics(query);
  }
}
