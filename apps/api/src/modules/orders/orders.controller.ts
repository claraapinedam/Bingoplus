import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { BusinessOwnershipGuard } from '../../common/guards/business-ownership.guard';
import { Audit } from '../../common/decorators/audit.decorator';
import { OrdersService } from './orders.service';
import { CancellationService } from './cancellation.service';
import { RefundService } from './refund.service';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly cancellation: CancellationService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListOrdersQueryDto) {
    return this.orders.listForCustomer(user.id, query);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.orders.getForCustomer(user.id, id);
  }

  @Audit('order.cancel', 'Order')
  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CancelOrderDto) {
    return this.cancellation.cancelByCustomer(user.id, id, dto.reason);
  }
}

@ApiTags('business/orders')
@UseGuards(BusinessOwnershipGuard)
@Controller('me/business/:businessId/orders')
export class BusinessOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly cancellation: CancellationService,
    private readonly refunds: RefundService,
  ) {}

  @Get()
  list(@Param('businessId') businessId: string, @Query() query: ListOrdersQueryDto) {
    return this.orders.listForBusiness(businessId, query);
  }

  @Get(':id')
  getOne(@Param('businessId') businessId: string, @Param('id') id: string) {
    return this.orders.getForBusiness(businessId, id);
  }

  @Audit('order.status.update', 'Order')
  @Patch(':id/status')
  updateStatus(
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.orders.updateStatusForBusiness(businessId, id, dto.status);
  }

  @Audit('order.cancel.byBusiness', 'Order')
  @Post(':id/cancel')
  cancel(@Param('businessId') businessId: string, @Param('id') id: string, @Body() dto: CancelOrderDto) {
    return this.cancellation.cancelByBusiness(businessId, id, dto.reason);
  }

  @Get(':id/refunds')
  async listRefunds(@Param('businessId') businessId: string, @Param('id') id: string) {
    await this.orders.getForBusiness(businessId, id); // enforces ownership before exposing refunds
    return this.refunds.listForOrder(id);
  }
}
