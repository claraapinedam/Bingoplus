import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { PublicProductCategoriesController, PublicProductsController } from './public-catalog.controller';
import { BusinessProductsController } from './business-products.controller';

@Module({
  controllers: [PublicProductCategoriesController, PublicProductsController, BusinessProductsController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
