import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { OrdersModule } from '../orders/orders.module';
import { MapModule } from '../maps/map.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BusinessCapabilitiesModule } from '../business-capabilities/business-capabilities.module';
import { DeliveryFareModule } from './delivery-fare.module';
import { DeliveryEligibilityService } from './delivery-eligibility.service';
import { DeliveryStateMachine } from './delivery-state-machine';
import { CANDIDATE_DISCOVERY_TOKEN } from './candidate-discovery/candidate-discovery.interface';
import { PostgisCandidateProvider } from './candidate-discovery/postgis-candidate.provider';
import { EtaRankingService } from './eta-ranking.service';
import { DispatchService } from './dispatch.service';
import { DispatchOrchestratorService } from './dispatch-orchestrator.service';
import { OfferTimeoutSweeper } from './offer-timeout.sweeper';
import { SearchingRiderRetrySweeper } from './searching-rider-retry.sweeper';
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
    PostgisCandidateProvider,
    // §1 of the plan — swappable candidate-discovery token, mirrors MAP_PROVIDER_TOKEN in
    // ../maps/map.module.ts exactly. Swapping in a future H3CandidateProvider is a one-line change
    // right here (`useExisting: H3CandidateProvider`) — DispatchService/EtaRankingService never change.
    { provide: CANDIDATE_DISCOVERY_TOKEN, useExisting: PostgisCandidateProvider },
    EtaRankingService,
    DispatchService,
    DispatchOrchestratorService,
    OfferTimeoutSweeper,
    SearchingRiderRetrySweeper,
    DeliveryReassignmentService,
    DeliveryCancellationService,
    DeliveryProofService,
    DeliverySyncService,
    DeliveryService,
    RiderLocationService,
    DeliveryGateway,
  ],
  exports: [DeliveryService, DeliveryCancellationService, RiderLocationService, DispatchService],
})
export class DeliveryModule {}
