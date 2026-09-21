import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CommissionCouponsService } from './commission-coupons.service';
import { CreateCommissionCouponDto, UpdateCommissionCouponDto } from './dto/commission-coupon.dto';
import { SetCommissionCouponStatusDto } from './dto/set-commission-coupon-status.dto';

@ApiTags('admin/commission-coupons')
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN, RoleName.USER)
@UseGuards(RolesGuard)
@Controller('admin/commission-coupons')
export class CommissionCouponsController {
  constructor(private readonly commissionCoupons: CommissionCouponsService) {}

  @Get()
  list() {
    return this.commissionCoupons.list();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.commissionCoupons.getOne(id);
  }

  @Audit('commission-coupon.create', 'CommissionCoupon')
  @Post()
  create(@CurrentUser() admin: AuthenticatedUser, @Body() dto: CreateCommissionCouponDto) {
    return this.commissionCoupons.create(dto, admin.id);
  }

  @Audit('commission-coupon.update', 'CommissionCoupon')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCommissionCouponDto) {
    return this.commissionCoupons.update(id, dto);
  }

  @Audit('commission-coupon.status.update', 'CommissionCoupon')
  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() dto: SetCommissionCouponStatusDto) {
    return this.commissionCoupons.setStatus(id, dto.status);
  }
}
