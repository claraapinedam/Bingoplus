import { Module } from '@nestjs/common';
import { MapModule } from '../maps/map.module';
import { DeliveryFareConfigService } from './delivery-fare-config.service';
import { DeliveryFareCalculationService } from './delivery-fare-calculation.service';

/**
 * Deliberately separate from DeliveryModule (which imports OrdersModule, which imports
 * PricingModule) — PricingModule needs these two services for the checkout-time fare quote, and
 * importing DeliveryModule there would create Pricing → Delivery → Orders → Pricing, a circular
 * module dependency. This module only depends on MapModule, so both PricingModule and
 * DeliveryModule (and AdminModule, for the settings endpoint) can import it directly with no cycle.
 */
@Module({
  imports: [MapModule],
  providers: [DeliveryFareConfigService, DeliveryFareCalculationService],
  exports: [DeliveryFareConfigService, DeliveryFareCalculationService],
})
export class DeliveryFareModule {}
