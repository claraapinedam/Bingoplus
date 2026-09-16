import { Module } from '@nestjs/common';
import { PricingConfigService } from './pricing-config.service';
import { PriceCalculationService } from './price-calculation.service';
import { TaxCalculationService } from './tax-calculation.service';
import { DiscountService } from './discount.service';
import { StockService } from './stock.service';

@Module({
  providers: [PricingConfigService, PriceCalculationService, TaxCalculationService, DiscountService, StockService],
  exports: [PricingConfigService, PriceCalculationService, TaxCalculationService, DiscountService, StockService],
})
export class PricingModule {}
