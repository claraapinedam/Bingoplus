import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Delete, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags } from '@nestjs/swagger';
import { BusinessCapabilityType } from '@prisma/client';
import { Response } from 'express';
import { BusinessOwnershipGuard } from '../../common/guards/business-ownership.guard';
import { BusinessCapabilityGuard } from '../../common/guards/business-capability.guard';
import { BusinessActiveGuard } from '../../common/guards/business-active.guard';
import { RequireCapability } from '../../common/decorators/require-capability.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CatalogService } from './catalog.service';
import { BulkProductUploadService } from './bulk-product-upload.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateStockDto } from './dto/update-stock.dto';
import { ListBusinessProductsQueryDto } from './dto/list-products-query.dto';
import { CreateProductVariantDto, UpdateProductVariantDto } from './dto/product-variant.dto';
import { BulkCreateProductsDto } from './dto/bulk-create-products.dto';

const XLSX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream', // some browsers/OSes send this for .xlsx instead of the proper type
]);

@ApiTags('business/products')
@UseGuards(BusinessOwnershipGuard, BusinessActiveGuard, BusinessCapabilityGuard)
@RequireCapability(BusinessCapabilityType.SELLS_PRODUCTS)
@Controller('business/:businessId/products')
export class BusinessProductsController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly bulkUpload: BulkProductUploadService,
  ) {}

  @Get()
  list(@Param('businessId') businessId: string, @Query() query: ListBusinessProductsQueryDto) {
    return this.catalogService.listForBusiness(businessId, query);
  }

  // Registered before ":id" — otherwise Nest would match this literal path as an :id lookup instead.
  @Get('bulk-template')
  async getBulkTemplate(@Res() res: Response) {
    const buffer = await this.bulkUpload.getTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla-productos-bingoplus.xlsx"');
    res.send(buffer);
  }

  @Post('bulk-validate')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!XLSX_MIME_TYPES.has(file.mimetype) && !file.originalname.toLowerCase().endsWith('.xlsx')) {
          cb(new BadRequestException('Solo se aceptan archivos Excel (.xlsx)'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  validateBulkUpload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No se subió ningún archivo');
    return this.bulkUpload.validate(file.buffer);
  }

  @Audit('product.bulkCreate', 'Product')
  @Post('bulk-create')
  bulkCreate(@Param('businessId') businessId: string, @Body() dto: BulkCreateProductsDto) {
    return this.bulkUpload.bulkCreate(businessId, dto.products);
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
