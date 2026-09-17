import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CatalogService } from '../catalog/catalog.service';
import { ListProductsAdminQueryDto } from './dto/list-query.dto';

/** Global read-only product visibility (§15) — the business still owns product CRUD via
 * BusinessProductsController; admin only supervises here, never a parallel management surface. */
@ApiTags('admin/products')
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN, RoleName.USER)
@UseGuards(RolesGuard)
@Controller('admin/products')
export class AdminProductsController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  list(@Query() query: ListProductsAdminQueryDto) {
    return this.catalog.listForAdmin(query);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.catalog.getForAdmin(id);
  }
}
