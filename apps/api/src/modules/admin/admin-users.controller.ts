import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UsersService } from '../users/users.service';
import { ListUsersQueryDto } from './dto/list-query.dto';
import { CreateStaffUserDto } from './dto/create-staff-user.dto';

/**
 * "Usuarios" — ADMIN/SUPER_ADMIN/USER accounts, i.e. the accounts that can sign into this admin
 * panel itself. Marketplace buyers live under /admin/customers, riders under /admin/riders.
 * USER is a restricted role (blocked from Analytics/Settings — see AdminAnalyticsController /
 * AdminSettingsController, the only controllers that don't grant it) but can otherwise use this
 * screen same as ADMIN/SUPER_ADMIN — except creating new staff accounts, method-scoped below to
 * ADMIN/SUPER_ADMIN only so a USER account can never mint another admin-panel account.
 */
@ApiTags('admin/users')
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN, RoleName.USER)
@UseGuards(RolesGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  list(@Query() query: ListUsersQueryDto) {
    return this.usersService.listStaffForAdmin(query);
  }

  @Audit('user.create', 'User')
  @Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
  @Post()
  create(@Body() dto: CreateStaffUserDto) {
    return this.usersService.createStaffUser(dto);
  }

  @Audit('user.activate', 'User')
  @Patch(':id/activate')
  activate(@Param('id') id: string) {
    return this.usersService.setActive(id, true);
  }

  @Audit('user.suspend', 'User')
  @Patch(':id/suspend')
  suspend(@Param('id') id: string) {
    return this.usersService.setActive(id, false);
  }
}
