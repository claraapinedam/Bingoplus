import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RidersService } from '../riders/riders.service';
import { ListRidersQueryDto } from './dto/list-query.dto';
import { SetRiderStatusDto } from './dto/set-rider-status.dto';

@ApiTags('admin/riders')
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
@UseGuards(RolesGuard)
@Controller('admin/riders')
export class AdminRidersController {
  constructor(private readonly ridersService: RidersService) {}

  @Get()
  list(@Query() query: ListRidersQueryDto) {
    return this.ridersService.listForAdmin(query);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.ridersService.getOne(id);
  }

  @Audit('rider.approve', 'Rider')
  @Patch(':id/approve')
  approve(@Param('id') id: string) {
    return this.ridersService.approve(id);
  }

  @Audit('rider.suspend', 'Rider')
  @Patch(':id/suspend')
  suspend(@Param('id') id: string) {
    return this.ridersService.suspend(id);
  }

  @Audit('rider.reactivate', 'Rider')
  @Patch(':id/reactivate')
  reactivate(@Param('id') id: string) {
    return this.ridersService.reactivate(id);
  }

  @Audit('rider.set_status', 'Rider')
  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() dto: SetRiderStatusDto) {
    return this.ridersService.setStatus(id, dto.status);
  }
}
