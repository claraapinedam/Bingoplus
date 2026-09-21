import { BadRequestException, Body, Controller, Get, Param, ParseEnumPipe, Patch, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ContractTemplateType, RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { BusinessRankingService } from '../ranking/business-ranking.service';
import { RankingWeightsDto } from './dto/ranking-weights.dto';
import { PricingConfigService } from '../pricing/pricing-config.service';
import { SetPricingConfigDto } from '../pricing/dto/set-pricing-config.dto';
import { DeliveryFareConfigService } from '../delivery/delivery-fare-config.service';
import { SetDeliveryFareConfigDto } from '../delivery/dto/set-delivery-fare-config.dto';
import { BusinessesService } from '../businesses/businesses.service';
import { SetDefaultCommissionRateDto } from './dto/set-default-commission-rate.dto';
import { ContractTemplateService } from '../contracts/contract-template.service';
import { SetContractTemplateDto } from './dto/set-contract-template.dto';

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
    private readonly deliveryFareConfig: DeliveryFareConfigService,
    private readonly businesses: BusinessesService,
    private readonly contractTemplates: ContractTemplateService,
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

  /** Delivery is an agreement BINGO+ makes with the Rider, not something a business sets — see
   * DeliveryFareCalculationService. */
  @Get('delivery-fare')
  getDeliveryFare() {
    return this.deliveryFareConfig.get();
  }

  @Audit('settings.delivery-fare.update', 'DeliveryFareConfig')
  @Patch('delivery-fare')
  setDeliveryFare(@CurrentUser() admin: AuthenticatedUser, @Body() dto: SetDeliveryFareConfigDto) {
    if (dto.nightStartHour === dto.nightEndHour) {
      throw new BadRequestException('nightStartHour and nightEndHour cannot be the same hour');
    }
    return this.deliveryFareConfig.set(dto, admin.id);
  }

  /** The business's own commission is Commission.rate, frozen per-business once its contract is
   * signed (see BusinessesService.approve) — this is only the fallback rate used when approving
   * without an explicit override. */
  @Get('default-commission-rate')
  async getDefaultCommissionRate() {
    return { rate: await this.businesses.getDefaultCommissionRateForAdmin() };
  }

  @Audit('settings.default-commission-rate.update', 'PlatformSetting')
  @Patch('default-commission-rate')
  async setDefaultCommissionRate(@CurrentUser() admin: AuthenticatedUser, @Body() dto: SetDefaultCommissionRateDto) {
    return { rate: await this.businesses.setDefaultCommissionRate(dto.rate, admin.id) };
  }

  /** One editable template per type (BUSINESS/RIDER), used for every applicant going forward —
   * see ContractsService.buildFeeSnapshot / RiderContractsService.createForApprovedRider, which
   * read the latest row here and freeze the result onto that specific contract at generation time. */
  @Get('contract-templates/:type')
  getContractTemplate(@Param('type', new ParseEnumPipe(ContractTemplateType)) type: ContractTemplateType) {
    return this.contractTemplates.get(type).then((content) => ({ type, content }));
  }

  @Audit('settings.contract-template.update', 'ContractTemplate')
  @Patch('contract-templates/:type')
  async setContractTemplate(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('type', new ParseEnumPipe(ContractTemplateType)) type: ContractTemplateType,
    @Body() dto: SetContractTemplateDto,
  ) {
    const content = await this.contractTemplates.set(type, dto.content, admin.id);
    return { type, content };
  }
}
