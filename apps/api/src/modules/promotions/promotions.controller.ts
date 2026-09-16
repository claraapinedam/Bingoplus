import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { BusinessOwnershipGuard } from '../../common/guards/business-ownership.guard';
import { PromotionsService } from './promotions.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { ListBusinessPromotionsQueryDto, ListPublicPromotionsQueryDto } from './dto/list-promotions-query.dto';

@ApiTags('public/promotions')
@Controller('public/promotions')
export class PublicPromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Public()
  @Get()
  list(@Query() query: ListPublicPromotionsQueryDto) {
    return this.promotions.listActiveForCustomer(query);
  }
}

@ApiTags('business/promotions')
@UseGuards(BusinessOwnershipGuard)
@Controller('business/:businessId/promotions')
export class BusinessPromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get()
  list(@Param('businessId') businessId: string, @Query() query: ListBusinessPromotionsQueryDto) {
    return this.promotions.listForBusiness(businessId, query.status);
  }

  @Get(':id')
  getOne(@Param('businessId') businessId: string, @Param('id') id: string) {
    return this.promotions.getForBusiness(businessId, id);
  }

  @Audit('promotion.create', 'Promotion')
  @Post()
  create(@Param('businessId') businessId: string, @Body() dto: CreatePromotionDto) {
    return this.promotions.create(businessId, dto);
  }

  @Audit('promotion.update', 'Promotion')
  @Patch(':id')
  update(@Param('businessId') businessId: string, @Param('id') id: string, @Body() dto: UpdatePromotionDto) {
    return this.promotions.update(businessId, id, dto);
  }

  @Audit('promotion.activate', 'Promotion')
  @Patch(':id/activate')
  activate(@Param('businessId') businessId: string, @Param('id') id: string) {
    return this.promotions.activate(businessId, id);
  }

  @Audit('promotion.pause', 'Promotion')
  @Patch(':id/pause')
  pause(@Param('businessId') businessId: string, @Param('id') id: string) {
    return this.promotions.pause(businessId, id);
  }

  @Audit('promotion.cancel', 'Promotion')
  @Patch(':id/cancel')
  cancel(@Param('businessId') businessId: string, @Param('id') id: string) {
    return this.promotions.cancel(businessId, id);
  }
}
