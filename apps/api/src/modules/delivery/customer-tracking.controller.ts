import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { DeliveryService } from './delivery.service';
import { DeliveryProofService } from './delivery-proof.service';
import { RiderLocationService } from './rider-location.service';
import { DeliveryChatService } from './delivery-chat.service';
import { MapService } from '../maps/map.service';
import { ListDeliveryChatMessagesQueryDto, SendDeliveryChatMessageDto } from './dto/delivery-chat.dto';

/** §33/64: never exposes Rider PII beyond first name + rating — no phone, no full location
 * history, nothing about a rider who isn't the one assigned to this customer's own order. */
function publicRiderView(delivery: Awaited<ReturnType<DeliveryService['getForCustomer']>>) {
  const rider = delivery.rider;
  return rider
    ? { firstName: rider.user.firstName, ratingAvg: rider.ratingAvg, vehicleType: rider.vehicles[0]?.type ?? null }
    : null;
}

@ApiTags('orders/tracking')
@Controller('orders')
export class OrderTrackingController {
  constructor(private readonly delivery: DeliveryService) {}

  @Get(':id/delivery')
  async getDelivery(@CurrentUser() user: AuthenticatedUser, @Param('id') orderId: string) {
    return this.delivery.getForOrder(user.id, orderId);
  }

  /** §90 (FASE 4B) + FASE 4C: the shape the "Seguimiento de tu pedido" screen needs — now
   * includes `orderStatus` so the timeline can render the Order-level steps (confirmed,
   * preparing, ready) that happen before a Delivery exists, not just the Delivery substates.
   * Never 404s for a DELIVERY order without a Delivery yet — `delivery` is just null. */
  @Get(':id/tracking')
  async getTracking(@CurrentUser() user: AuthenticatedUser, @Param('id') orderId: string) {
    const { order, delivery } = await this.delivery.getTrackingForOrder(user.id, orderId);
    return {
      orderStatus: order.status,
      fulfillmentType: order.fulfillmentType,
      deliveryId: delivery?.id ?? null,
      status: delivery?.status ?? null,
      rider: delivery ? publicRiderView(delivery) : null,
      pickup: delivery?.pickupAddressSnapshot ?? null,
      destination: delivery?.deliveryAddressSnapshot ?? null,
      route: (delivery?.route as { polyline: string } | null) ?? null,
      estimatedDistanceKm: delivery?.estimatedDistanceKm ?? null,
      estimatedDurationMinutes: delivery?.estimatedDurationMinutes ?? null,
      assignedAt: delivery?.assignedAt ?? null,
      acceptedAt: delivery?.acceptedAt ?? null,
      pickedUpAt: delivery?.pickedUpAt ?? null,
      deliveredAt: delivery?.deliveredAt ?? null,
    };
  }
}

@ApiTags('deliveries/tracking')
@Controller('deliveries')
export class DeliveryTrackingController {
  constructor(
    private readonly delivery: DeliveryService,
    private readonly proof: DeliveryProofService,
    private readonly location: RiderLocationService,
    private readonly maps: MapService,
    private readonly chat: DeliveryChatService,
  ) {}

  @Get(':id/status')
  async getStatus(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const delivery = await this.delivery.getForCustomer(user.id, id);
    return { status: delivery.status, rider: publicRiderView(delivery) };
  }

  @Get(':id/eta')
  async getEta(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const delivery = await this.delivery.getForCustomer(user.id, id);
    const rider = delivery.rider;
    // §46: never a falsely precise number — a range when we can compute one, null when we can't.
    if (!rider?.currentLatitude || !rider.currentLongitude) {
      return { etaMinutes: null, distanceKm: null };
    }
    const destination = delivery.deliveryAddressSnapshot as { latitude?: number; longitude?: number };
    if (destination?.latitude == null || destination?.longitude == null) {
      return { etaMinutes: null, distanceKm: null };
    }
    const eta = await this.maps.calculateETASafe(
      { latitude: rider.currentLatitude, longitude: rider.currentLongitude },
      { latitude: destination.latitude, longitude: destination.longitude },
    );
    return eta ?? { etaMinutes: null, distanceKm: null };
  }

  /** §33/64: only the assigned rider's latest point for THIS delivery — never the full history,
   * never other riders. Falls back to the rider's ambient current location if no delivery-scoped
   * ping has landed yet (e.g. right after acceptance, before the first location update). */
  @Get(':id/location')
  async getLocation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const delivery = await this.delivery.getForCustomer(user.id, id);
    if (!delivery.rider) return { latitude: null, longitude: null, updatedAt: null };
    const latest = await this.location.getLatestForDelivery(id);
    if (latest) {
      return { latitude: latest.latitude, longitude: latest.longitude, updatedAt: latest.createdAt };
    }
    return {
      latitude: delivery.rider.currentLatitude,
      longitude: delivery.rider.currentLongitude,
      updatedAt: delivery.rider.lastLocationAt,
    };
  }

  /** §31/33: the OTP the customer reads to the rider — only while it's still unverified. */
  @Get(':id/otp')
  async getOtp(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.delivery.getForCustomer(user.id, id); // enforces ownership before exposing the code
    return this.proof.getCodeForCustomer(id);
  }

  /** Rider<->customer chat — REST is the history/catch-up path; live delivery is the
   * `delivery.chat.message` socket event on the `delivery:{id}` room (see DeliveryGateway). */
  @Get(':id/chat/messages')
  async listChatMessages(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Query() query: ListDeliveryChatMessagesQueryDto) {
    return this.chat.listForCustomer(user.id, id, query.after);
  }

  @Post(':id/chat/messages')
  async sendChatMessage(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: SendDeliveryChatMessageDto) {
    return this.chat.sendForCustomer(user.id, id, dto.text);
  }
}
