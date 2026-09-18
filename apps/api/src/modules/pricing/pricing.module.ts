import { Module } from '@nestjs/common';
import { PricingConfigService } from './pricing-config.service';
import { PriceCalculationService } from './price-calculation.service';
import { TaxCalculationService } from './tax-calculation.service';
import { DiscountService } from './discount.service';
import { StockService } from './stock.service';
import { DeliveryFareModule } from '../delivery/delivery-fare.module';

@Module({
  imports: [DeliveryFareModule],
  providers: [PricingConfigService, PriceCalculationService, TaxCalculationService, DiscountService, StockService],
  exports: [PricingConfigService, PriceCalculationService, TaxCalculationService, DiscountService, StockService],
})
export class PricingModule {}
