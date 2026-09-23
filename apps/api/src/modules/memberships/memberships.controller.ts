import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { BusinessOwnershipGuard } from '../../common/guards/business-ownership.guard';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { MembershipsService } from './memberships.service';
import { RedeemAdminCouponDto } from './dto/redeem-admin-coupon.dto';
import { SubmitMembershipPaymentDto } from './dto/membership-payment.dto';

@ApiTags('public/membership-plans')
@Controller('public/membership-plans')
export class PublicMembershipPlansController {
  constructor(private readonly memberships: MembershipsService) {}

  @Public()
  @Get()
  list() {
    return this.memberships.listPlans();
  }
}

@ApiTags('me/business/membership')
@UseGuards(BusinessOwnershipGuard)
@Controller('me/business/:businessId/membership')
export class BusinessMembershipController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get()
  get(@Param('businessId') businessId: string) {
    return this.memberships.getForBusiness(businessId);
  }

  @Audit('membership.admin-coupon.redeem', 'BusinessMembership')
  @Post('redeem-coupon')
  redeemCoupon(@Param('businessId') businessId: string, @Body() dto: RedeemAdminCouponDto) {
    return this.memberships.redeemAdminCoupon(businessId, dto.code);
  }

  @Audit('membership.payment.submit', 'MembershipPayment')
  @Post('payments')
  submitPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('businessId') businessId: string,
    @Body() dto: SubmitMembershipPaymentDto,
  ) {
    return this.memberships.submitPayment(businessId, user.id, dto.receiptUrl, dto.method);
  }
}
