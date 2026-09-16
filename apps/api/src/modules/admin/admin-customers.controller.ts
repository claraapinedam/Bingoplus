import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UsersService } from '../users/users.service';
import { ListUsersQueryDto } from './dto/list-query.dto';

/**
 * "Clientes" — CUSTOMER-role accounts (marketplace buyers), separate from "Usuarios"
 * (admin-panel staff) and "Riders". See UsersService §Admin-facing for the full split.
 */
@ApiTags('admin/customers')
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
@UseGuards(RolesGuard)
@Controller('admin/customers')
export class AdminCustomersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  list(@Query() query: ListUsersQueryDto) {
    return this.usersService.listCustomersForAdmin(query);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.usersService.getCustomerForAdmin(id);
  }

  @Audit('customer.activate', 'User')
  @Patch(':id/activate')
  activate(@Param('id') id: string) {
    return this.usersService.setActive(id, true);
  }

  @Audit('customer.suspend', 'User')
  @Patch(':id/suspend')
  suspend(@Param('id') id: string) {
    return this.usersService.setActive(id, false);
  }
}
