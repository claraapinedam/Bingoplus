import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CouponsService } from '../coupons/coupons.service';
import { ListBusinessCouponsAdminQueryDto } from './dto/list-query.dto';

/** Global, read-only supervision of BusinessCoupon (§17) — never AdminCoupon (see
 * admin-coupons module for that separate financial domain). Businesses keep full ownership of
 * their own coupons; this exists only so an admin can see across every business at once. */
@ApiTags('admin/business-coupons')
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN, RoleName.USER)
@UseGuards(RolesGuard)
@Controller('admin/business-coupons')
export class AdminBusinessCouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get()
  list(@Query() query: ListBusinessCouponsAdminQueryDto) {
    return this.coupons.listForAdmin(query);
  }
}
