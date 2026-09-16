import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CatalogService } from './catalog.service';
import { ListPublicProductsQueryDto } from './dto/list-products-query.dto';

@ApiTags('public/product-categories')
@Controller('public/product-categories')
export class PublicProductCategoriesController {
  constructor(private readonly catalogService: CatalogService) {}

  @Public()
  @Get()
  list() {
    return this.catalogService.listCategories();
  }
}

@ApiTags('public/products')
@Controller('public/products')
export class PublicProductsController {
  constructor(private readonly catalogService: CatalogService) {}

  @Public()
  @Get()
  list(@Query() query: ListPublicProductsQueryDto) {
    return this.catalogService.listPublicProducts(query);
  }

  @Public()
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.catalogService.getPublicProduct(id);
  }
}
