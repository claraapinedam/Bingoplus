import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { OrdersModule } from '../orders/orders.module';
import { MapModule } from '../maps/map.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BusinessCapabilitiesModule } from '../business-capabilities/business-capabilities.module';
import { DeliveryFareModule } from './delivery-fare.module';
import { DeliveryEligibilityService } from './delivery-eligibility.service';
import { DeliveryStateMachine } from './delivery-state-machine';
import { DispatchService } from './dispatch.service';
import { DeliveryReassignmentService } from './delivery-reassignment.service';
import { DeliveryCancellationService } from './delivery-cancellation.service';
import { DeliveryProofService } from './delivery-proof.service';
import { DeliverySyncService } from './delivery-sync.service';
import { DeliveryService } from './delivery.service';
import { RiderLocationService } from './rider-location.service';
import { DeliveryGateway } from './delivery.gateway';
import { RiderDeliveryController } from './rider-delivery.controller';
import { OrderTrackingController, DeliveryTrackingController } from './customer-tracking.controller';
import { BusinessDeliveryController } from './business-delivery.controller';

@Module({
  imports: [OrdersModule, MapModule, NotificationsModule, BusinessCapabilitiesModule, DeliveryFareModule, JwtModule.register({})],
  controllers: [RiderDeliveryController, OrderTrackingController, DeliveryTrackingController, BusinessDeliveryController],
  providers: [
    DeliveryEligibilityService,
    DeliveryStateMachine,
    DispatchService,
    DeliveryReassignmentService,
    DeliveryCancellationService,
    DeliveryProofService,
    DeliverySyncService,
    DeliveryService,
    RiderLocationService,
    DeliveryGateway,
  ],
  exports: [DeliveryService, DeliveryCancellationService, RiderLocationService],
})
export class DeliveryModule {}
