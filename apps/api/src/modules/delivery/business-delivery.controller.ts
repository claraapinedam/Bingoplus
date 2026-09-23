import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BusinessCapabilityType, FulfillmentType } from '@prisma/client';
import { Audit } from '../../common/decorators/audit.decorator';
import { BusinessOwnershipGuard } from '../../common/guards/business-ownership.guard';
import { BusinessCapabilityGuard } from '../../common/guards/business-capability.guard';
import { RequireCapability } from '../../common/decorators/require-capability.decorator';
import { DeliveryService } from './delivery.service';
import { OrdersService } from '../orders/orders.service';
import { RiderLocationService } from './rider-location.service';

/** §24/59: `me/business/:businessId/...` matches the existing business-facing route convention
 * (see BusinessOrdersController) rather than the spec's flatter `/business/...` shorthand. */
@ApiTags('business/deliveries')
@UseGuards(BusinessOwnershipGuard)
@Controller('me/business/:businessId')
export class BusinessDeliveryController {
  constructor(
    private readonly delivery: DeliveryService,
    private readonly orders: OrdersService,
    private readonly location: RiderLocationService,
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

  /** Business-side counterpart to DeliveryTrackingController.getLocation (customer-tracking.
   * controller.ts) — same shape, same RiderLocationService, just ownership-checked via businessId
   * instead of customer userId. The gateway's `subscribe:delivery` was already widened (FASE 4C)
   * for Business to receive `delivery.location.updated` live; this is the REST fallback/initial
   * value for the same room so the Business order-detail map isn't blind until the first socket
   * push arrives. Returns nulls rather than 404 whenever there's no delivery/rider yet. */
  @Get('orders/:id/delivery/location')
  async getDeliveryLocation(@Param('businessId') businessId: string, @Param('id') id: string) {
    const delivery = await this.delivery.getForBusinessByOrder(businessId, id);
    if (!delivery?.rider) return { latitude: null, longitude: null, updatedAt: null };
    const latest = await this.location.getLatestForDelivery(delivery.id);
    if (latest) {
      return { latitude: latest.latitude, longitude: latest.longitude, updatedAt: latest.createdAt };
    }
    return {
      latitude: delivery.rider.currentLatitude,
      longitude: delivery.rider.currentLongitude,
      updatedAt: delivery.rider.lastLocationAt,
    };
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
