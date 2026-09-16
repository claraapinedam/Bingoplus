import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UsersService } from '../users/users.service';
import { ListUsersQueryDto } from './dto/list-query.dto';

/**
 * "Usuarios" — ADMIN/SUPER_ADMIN accounts only, i.e. the accounts that can sign into this admin
 * panel itself. Marketplace buyers live under /admin/customers, riders under /admin/riders.
 */
@ApiTags('admin/users')
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
@UseGuards(RolesGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  list(@Query() query: ListUsersQueryDto) {
    return this.usersService.listStaffForAdmin(query);
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
