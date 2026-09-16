import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { AdminCouponsService } from './admin-coupons.service';
import { CreateAdminCouponDto, UpdateAdminCouponDto } from './dto/admin-coupon.dto';
import { SetAdminCouponStatusDto } from './dto/set-admin-coupon-status.dto';

@ApiTags('admin/coupons')
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
@UseGuards(RolesGuard)
@Controller('admin/coupons')
export class AdminCouponsController {
  constructor(private readonly adminCoupons: AdminCouponsService) {}

  @Get()
  list() {
    return this.adminCoupons.list();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.adminCoupons.getOne(id);
  }

  @Audit('admin-coupon.create', 'AdminCoupon')
  @Post()
  create(@CurrentUser() admin: AuthenticatedUser, @Body() dto: CreateAdminCouponDto) {
    return this.adminCoupons.create(dto, admin.id);
  }

  @Audit('admin-coupon.update', 'AdminCoupon')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAdminCouponDto) {
    return this.adminCoupons.update(id, dto);
  }

  @Audit('admin-coupon.status.update', 'AdminCoupon')
  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() dto: SetAdminCouponStatusDto) {
    return this.adminCoupons.setStatus(id, dto.status);
  }
}
