import { BadRequestException, Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { BusinessRankingService } from '../ranking/business-ranking.service';
import { RankingWeightsDto } from './dto/ranking-weights.dto';
import { PricingConfigService } from '../pricing/pricing-config.service';
import { SetPricingConfigDto } from '../pricing/dto/set-pricing-config.dto';

/**
 * Marketplace ranking configuration — kept out of code per the project rule that these weights
 * must never be hardcoded. See docs/... marketplace ranking spec and BusinessRankingService.
 */
@ApiTags('admin/settings')
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
@UseGuards(RolesGuard)
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(
    private readonly ranking: BusinessRankingService,
    private readonly pricingConfig: PricingConfigService,
  ) {}

  @Get('ranking-weights')
  getWeights() {
    return this.ranking.getWeights();
  }

  @Audit('settings.ranking-weights.update', 'MarketplaceRankingConfig')
  @Patch('ranking-weights')
  setWeights(@CurrentUser() admin: AuthenticatedUser, @Body() dto: RankingWeightsDto) {
    const sum = dto.speciesMatch + dto.distance + dto.availability + dto.rating + dto.delivery;
    if (Math.abs(sum - 1) > 0.001) {
      throw new BadRequestException(`Ranking weights must sum to 1 (got ${sum.toFixed(3)})`);
    }
    return this.ranking.setWeights(dto, admin.id);
  }

  /** Marketplace checkout fees (§9/37) — never hardcoded, see PriceCalculationService. */
  @Get('pricing')
  getPricing() {
    return this.pricingConfig.get();
  }

  @Audit('settings.pricing.update', 'PricingConfiguration')
  @Patch('pricing')
  setPricing(@CurrentUser() admin: AuthenticatedUser, @Body() dto: SetPricingConfigDto) {
    return this.pricingConfig.set(dto, admin.id);
  }
}
