import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuditLogsService } from './audit-logs.service';
import { ListAuditLogsQueryDto } from '../admin/dto/list-query.dto';

/** §27: browse-only — there is deliberately no create/update/delete route here. AuditLog rows are
 * written exclusively by AuditLogInterceptor as a side effect of @Audit()-decorated actions. */
@ApiTags('admin/audit-logs')
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
@UseGuards(RolesGuard)
@Controller('admin/audit-logs')
export class AdminAuditLogsController {
  constructor(private readonly auditLogs: AuditLogsService) {}

  @Get()
  list(@Query() query: ListAuditLogsQueryDto) {
    return this.auditLogs.list(query);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.auditLogs.getOne(id);
  }
}
