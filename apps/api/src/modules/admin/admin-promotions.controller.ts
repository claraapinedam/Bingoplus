import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PromotionsService } from '../promotions/promotions.service';
import { ListAdminPromotionsQueryDto } from '../promotions/dto/list-promotions-query.dto';

/** Global read-only supervision — the business still owns Promotion CRUD via
 * BusinessPromotionsController, admin only supervises here (§9). */
@ApiTags('admin/promotions')
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
@UseGuards(RolesGuard)
@Controller('admin/promotions')
export class AdminPromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get()
  list(@Query() query: ListAdminPromotionsQueryDto) {
    return this.promotions.listForAdmin(query);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.promotions.getForAdmin(id);
  }
}
