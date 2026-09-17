import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { BusinessOwnershipGuard } from '../../common/guards/business-ownership.guard';
import { BusinessActiveGuard } from '../../common/guards/business-active.guard';
import { BusinessesService } from './businesses.service';
import { ApplyBusinessDto } from './dto/apply-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { AddBusinessDocumentDto } from './dto/add-document.dto';
import { ListMarketplaceQueryDto } from './dto/list-marketplace-query.dto';
import { SetCapabilityDto } from '../business-capabilities/dto/set-capability.dto';

@ApiTags('public/business-categories')
@Controller('public/business-categories')
export class BusinessCategoriesController {
  constructor(private readonly businessesService: BusinessesService) {}

  @Public()
  @Get()
  list() {
    return this.businessesService.listCategories();
  }
}

/**
 * "Tiendas" — the marketplace's primary discovery surface. Business cards ranked by
 * BusinessRankingService, never a flat/global product catalog. `/public/businesses` works
 * anonymously (optionally filtered by `species`); `/me/businesses` additionally auto-derives
 * species relevance from the caller's own pets.
 */
@ApiTags('marketplace/businesses')
@Controller()
export class MarketplaceBusinessesController {
  constructor(private readonly businessesService: BusinessesService) {}

  @Public()
  @Get('public/businesses')
  listPublic(@Query() query: ListMarketplaceQueryDto) {
    return this.businessesService.listMarketplace(query);
  }

  @Public()
  @Get('public/businesses/:id')
  getPublicOne(@Param('id') id: string) {
    return this.businessesService.getPublicBusiness(id);
  }

  @Get('me/businesses')
  listForCustomer(@CurrentUser() user: AuthenticatedUser, @Query() query: ListMarketplaceQueryDto) {
    return this.businessesService.listMarketplace(query, user.id);
  }
}

@ApiTags('me/business')
@Controller('me/business')
export class BusinessesController {
  constructor(private readonly businessesService: BusinessesService) {}

  @Post()
  apply(@CurrentUser() user: AuthenticatedUser, @Body() dto: ApplyBusinessDto) {
    return this.businessesService.apply(user.id, dto);
  }

  @Get()
  listOwn(@CurrentUser() user: AuthenticatedUser) {
    return this.businessesService.listOwn(user.id);
  }

  @UseGuards(BusinessOwnershipGuard)
  @Get(':businessId')
  getOne(@Param('businessId') businessId: string) {
    return this.businessesService.getOne(businessId);
  }

  @UseGuards(BusinessOwnershipGuard)
  @Patch(':businessId')
  update(@Param('businessId') businessId: string, @Body() dto: UpdateBusinessDto) {
    return this.businessesService.update(businessId, dto);
  }

  @UseGuards(BusinessOwnershipGuard)
  @Post(':businessId/documents')
  addDocument(@Param('businessId') businessId: string, @Body() dto: AddBusinessDocumentDto) {
    return this.businessesService.addDocument(businessId, dto);
  }

  @UseGuards(BusinessOwnershipGuard)
  @Get(':businessId/capabilities')
  getCapabilities(@Param('businessId') businessId: string) {
    return this.businessesService.getCapabilities(businessId);
  }

  @UseGuards(BusinessOwnershipGuard, BusinessActiveGuard)
  @Patch(':businessId/capabilities')
  setCapability(@Param('businessId') businessId: string, @Body() dto: SetCapabilityDto) {
    return this.businessesService.setOperationalCapability(businessId, dto.capability, dto.enabled);
  }
}
