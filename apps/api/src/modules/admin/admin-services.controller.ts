import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ServicesService } from '../services/services.service';
import { ListAdminServicesQueryDto } from '../services/dto/list-services-query.dto';

/** Global read-only service visibility (FASE 7 §33/34) — the business still owns Service CRUD
 * via BusinessServicesController, admin only supervises here, never a parallel management surface. */
@ApiTags('admin/services')
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
@UseGuards(RolesGuard)
@Controller('admin/services')
export class AdminServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  list(@Query() query: ListAdminServicesQueryDto) {
    return this.servicesService.listForAdmin(query);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.servicesService.getForAdmin(id);
  }
}
