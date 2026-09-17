import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ReviewsService } from '../reviews/reviews.service';
import { ResolveReportDto } from '../reviews/dto/moderate-review.dto';
import { ListAdminReviewsQueryDto, ListAdminReviewReportsQueryDto } from './dto/list-query.dto';

/** Moderation surface — never a second place to author reviews, only to hide/restore and triage
 * reports (§3.6). Every action here is @Audit'd (RULE 13). */
@ApiTags('admin/reviews')
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN, RoleName.USER)
@UseGuards(RolesGuard)
@Controller('admin/reviews')
export class AdminReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  list(@Query() query: ListAdminReviewsQueryDto) {
    return this.reviews.listForAdmin(query);
  }

  @Get('reports')
  listReports(@Query() query: ListAdminReviewReportsQueryDto) {
    return this.reviews.listReports(query);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.reviews.getForAdmin(id);
  }

  @Audit('review.hide', 'Review')
  @Patch(':id/hide')
  hide(@Param('id') id: string) {
    return this.reviews.hide(id);
  }

  @Audit('review.restore', 'Review')
  @Patch(':id/restore')
  restore(@Param('id') id: string) {
    return this.reviews.restore(id);
  }

  @Audit('review.report.resolve', 'ReviewReport')
  @Patch('reports/:id/resolve')
  resolveReport(@CurrentUser() admin: AuthenticatedUser, @Param('id') id: string, @Body() dto: ResolveReportDto) {
    return this.reviews.resolveReport(admin.id, id, 'RESOLVED', dto);
  }

  @Audit('review.report.dismiss', 'ReviewReport')
  @Patch('reports/:id/dismiss')
  dismissReport(@CurrentUser() admin: AuthenticatedUser, @Param('id') id: string, @Body() dto: ResolveReportDto) {
    return this.reviews.resolveReport(admin.id, id, 'DISMISSED', dto);
  }
}

