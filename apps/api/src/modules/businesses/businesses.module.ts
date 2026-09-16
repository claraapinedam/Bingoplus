import { Module } from '@nestjs/common';
import {
  BusinessesController,
  BusinessCategoriesController,
  MarketplaceBusinessesController,
} from './businesses.controller';
import { BusinessesService } from './businesses.service';
import { RankingModule } from '../ranking/ranking.module';
import { BusinessCapabilitiesModule } from '../business-capabilities/business-capabilities.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { CouponsModule } from '../coupons/coupons.module';

@Module({
  imports: [RankingModule, BusinessCapabilitiesModule, MembershipsModule, CouponsModule],
  controllers: [BusinessesController, BusinessCategoriesController, MarketplaceBusinessesController],
  providers: [BusinessesService],
  exports: [BusinessesService, BusinessCapabilitiesModule],
})
export class BusinessesModule {}
