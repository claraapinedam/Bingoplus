import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PricingConfigService } from './pricing-config.service';

/**
 * Read-only, unauthenticated — lets the Customer App show a tax preview (product page / cart)
 * *before* checkout, using the exact same rate TaxCalculationService/PriceCalculationService will
 * apply at checkout time (§ "no surprises at checkout"). Never recomputes or duplicates the tax
 * math itself — just exposes the one number (defaultTaxPercent) a client needs to preview
 * ProductTaxCategory.STANDARD lines; ZERO-rated lines are always 0% regardless of this value.
 */
@ApiTags('public/pricing')
@Controller('public/pricing')
export class PublicPricingController {
  constructor(private readonly pricingConfig: PricingConfigService) {}

  @Public()
  @Get('tax-rate')
  async getTaxRate() {
    const config = await this.pricingConfig.get();
    return { defaultTaxPercent: config.defaultTaxPercent };
  }
}
