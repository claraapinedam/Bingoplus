import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { OrdersService } from '../orders/orders.service';
import { ListOrdersAdminQueryDto } from './dto/list-query.dto';

/** Global, read-only order supervision (§12/13) — never a second state machine. Every mutation
 * an admin might need (status changes, cancellation) already exists via the business/customer
 * flows; this controller exists only so an admin can see across every business at once. */
@ApiTags('admin/orders')
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
@UseGuards(RolesGuard)
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query() query: ListOrdersAdminQueryDto) {
    return this.orders.listForAdmin(query);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.orders.getForAdmin(id);
  }
}
