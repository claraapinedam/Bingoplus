import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BusinessCapabilityType, FulfillmentType } from '@prisma/client';
import { Audit } from '../../common/decorators/audit.decorator';
import { BusinessOwnershipGuard } from '../../common/guards/business-ownership.guard';
import { BusinessCapabilityGuard } from '../../common/guards/business-capability.guard';
import { RequireCapability } from '../../common/decorators/require-capability.decorator';
import { DeliveryService } from './delivery.service';
import { OrdersService } from '../orders/orders.service';

/** §24/59: `me/business/:businessId/...` matches the existing business-facing route convention
 * (see BusinessOrdersController) rather than the spec's flatter `/business/...` shorthand. */
@ApiTags('business/deliveries')
@UseGuards(BusinessOwnershipGuard)
@Controller('me/business/:businessId')
export class BusinessDeliveryController {
  constructor(
    private readonly delivery: DeliveryService,
    private readonly orders: OrdersService,
  ) {}

  // Only the standalone "browse my deliveries" views are capability-gated here — never
  // ready-for-pickup below, which every order (PICKUP included) must still be able to call
  // regardless of whether DELIVERY is enabled for this business.
  @UseGuards(BusinessCapabilityGuard)
  @RequireCapability(BusinessCapabilityType.DELIVERY)
  @Get('deliveries')
  list(@Param('businessId') businessId: string) {
    return this.delivery.listForBusiness(businessId);
  }

  @UseGuards(BusinessCapabilityGuard)
  @RequireCapability(BusinessCapabilityType.DELIVERY)
  @Get('deliveries/:id')
  getOne(@Param('businessId') businessId: string, @Param('id') id: string) {
    return this.delivery.getForBusiness(businessId, id);
  }

  @Get('orders/:id/delivery')
  getForOrder(@Param('businessId') businessId: string, @Param('id') id: string) {
    return this.delivery.getForBusinessByOrder(businessId, id);
  }

  /** §14/24/59: the one sanctioned trigger for a DELIVERY order to enter the logistics pipeline —
   * moves the order to READY_FOR_PICKUP and, only for DELIVERY orders, creates the Delivery and
   * kicks off dispatch in the same request. PICKUP orders just move the order status. */
  @Audit('order.ready_for_pickup', 'Order')
  @Post('orders/:id/ready-for-pickup')
  async readyForPickup(@Param('businessId') businessId: string, @Param('id') id: string) {
    const order = await this.orders.setReadyForPickup(businessId, id);
    if (order.fulfillmentType === FulfillmentType.DELIVERY) {
      return this.delivery.createForOrder(id);
    }
    return order;
  }
}
