import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DeliveryService } from './delivery.service';
import { DeliveryCancellationService } from './delivery-cancellation.service';
import { AdminAssignDeliveryDto, AdminCancelDeliveryDto, ListDeliveriesQueryDto } from './dto/delivery-action.dto';

@ApiTags('admin/deliveries')
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
@UseGuards(RolesGuard)
@Controller('admin/deliveries')
export class AdminDeliveryController {
  constructor(
    private readonly delivery: DeliveryService,
    private readonly cancellation: DeliveryCancellationService,
  ) {}

  @Get()
  list(@Query() query: ListDeliveriesQueryDto) {
    return this.delivery.listForAdmin(query);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.delivery.getForAdmin(id);
  }

  @Audit('delivery.assign', 'Delivery')
  @Post(':id/assign')
  assign(@Param('id') id: string, @Body() dto: AdminAssignDeliveryDto) {
    return this.delivery.adminAssign(id, dto.riderId);
  }

  @Audit('delivery.reassign', 'Delivery')
  @Post(':id/reassign')
  reassign(@Param('id') id: string, @Body() dto: AdminAssignDeliveryDto) {
    return this.delivery.adminAssign(id, dto.riderId);
  }

  @Audit('delivery.cancel', 'Delivery')
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Body() dto: AdminCancelDeliveryDto) {
    return this.cancellation.cancel(id, 'ADMIN', dto.reason);
  }
}
