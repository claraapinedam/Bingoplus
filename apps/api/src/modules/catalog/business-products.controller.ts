import { Body, Controller, Get, Param, Patch, Post, Delete, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BusinessCapabilityType } from '@prisma/client';
import { BusinessOwnershipGuard } from '../../common/guards/business-ownership.guard';
import { BusinessCapabilityGuard } from '../../common/guards/business-capability.guard';
import { RequireCapability } from '../../common/decorators/require-capability.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CatalogService } from './catalog.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateStockDto } from './dto/update-stock.dto';
import { ListBusinessProductsQueryDto } from './dto/list-products-query.dto';
import { CreateProductVariantDto, UpdateProductVariantDto } from './dto/product-variant.dto';

@ApiTags('business/products')
@UseGuards(BusinessOwnershipGuard, BusinessCapabilityGuard)
@RequireCapability(BusinessCapabilityType.SELLS_PRODUCTS)
@Controller('business/:businessId/products')
export class BusinessProductsController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get()
  list(@Param('businessId') businessId: string, @Query() query: ListBusinessProductsQueryDto) {
    return this.catalogService.listForBusiness(businessId, query);
  }

  @Get(':id')
  getOne(@Param('businessId') businessId: string, @Param('id') id: string) {
    return this.catalogService.getForBusiness(businessId, id);
  }

  @Audit('product.create', 'Product')
  @Post()
  create(@Param('businessId') businessId: string, @Body() dto: CreateProductDto) {
    return this.catalogService.create(businessId, dto);
  }

  @Audit('product.update', 'Product')
  @Patch(':id')
  update(
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.catalogService.update(businessId, id, dto);
  }

  @Audit('product.delete', 'Product')
  @Delete(':id')
  remove(@Param('businessId') businessId: string, @Param('id') id: string) {
    return this.catalogService.remove(businessId, id);
  }

  @Audit('product.activate', 'Product')
  @Patch(':id/activate')
  activate(@Param('businessId') businessId: string, @Param('id') id: string) {
    return this.catalogService.activate(businessId, id);
  }

  @Audit('product.deactivate', 'Product')
  @Patch(':id/deactivate')
  deactivate(@Param('businessId') businessId: string, @Param('id') id: string) {
    return this.catalogService.deactivate(businessId, id);
  }

  @Audit('product.updateStock', 'Product')
  @Patch(':id/stock')
  updateStock(
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStockDto,
  ) {
    return this.catalogService.updateStock(businessId, id, dto);
  }

  @Get(':id/stock-movements')
  listStockMovements(@Param('businessId') businessId: string, @Param('id') id: string) {
    return this.catalogService.listStockMovements(businessId, id);
  }

  @Get(':id/variants')
  listVariants(@Param('businessId') businessId: string, @Param('id') id: string) {
    return this.catalogService.listVariants(businessId, id);
  }

  @Audit('product.variant.create', 'ProductVariant')
  @Post(':id/variants')
  createVariant(
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @Body() dto: CreateProductVariantDto,
  ) {
    return this.catalogService.createVariant(businessId, id, dto);
  }

  @Audit('product.variant.update', 'ProductVariant')
  @Patch(':id/variants/:variantId')
  updateVariant(
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateProductVariantDto,
  ) {
    return this.catalogService.updateVariant(businessId, id, variantId, dto);
  }

  @Audit('product.variant.delete', 'ProductVariant')
  @Delete(':id/variants/:variantId')
  removeVariant(
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @Param('variantId') variantId: string,
  ) {
    return this.catalogService.removeVariant(businessId, id, variantId);
  }
}
