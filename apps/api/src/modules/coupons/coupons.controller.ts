import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BusinessCapabilityType, BusinessCouponStatus } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { BusinessOwnershipGuard } from '../../common/guards/business-ownership.guard';
import { BusinessCapabilityGuard } from '../../common/guards/business-capability.guard';
import { BusinessActiveGuard } from '../../common/guards/business-active.guard';
import { RequireCapability } from '../../common/decorators/require-capability.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CouponsService } from './coupons.service';
import { CreateBusinessCouponDto, UpdateBusinessCouponDto } from './dto/business-coupon.dto';
import { RedeemCouponDto } from './dto/redeem-coupon.dto';
import { ValidateCouponDto } from './dto/validate-coupon.dto';

@ApiTags('public/businesses/coupons')
@Controller('public/businesses/:businessId/coupons')
export class PublicBusinessCouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Public()
  @Get()
  list(@Param('businessId') businessId: string) {
    return this.coupons.listActiveForCustomers(businessId);
  }
}

/** §41: coupon detail is viewable without login — the QR itself (below) requires being signed in. */
@ApiTags('public/coupons')
@Controller('public/coupons')
export class PublicCouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Public()
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.coupons.getPublicDetail(id);
  }
}

@ApiTags('public/offers')
@Controller('public/offers')
export class PublicOffersController {
  constructor(private readonly coupons: CouponsService) {}

  @Public()
  @Get('businesses')
  listBusinesses() {
    return this.coupons.listBusinessesWithActiveOffers();
  }
}

@ApiTags('me/coupons')
@Controller('me/coupons')
export class CustomerCouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Post(':couponId/request-redemption')
  requestRedemption(@CurrentUser() user: AuthenticatedUser, @Param('couponId') couponId: string) {
    return this.coupons.requestRedemptionToken(user.id, couponId);
  }

  /** §42: the token to show as a QR (view only, no image rendering). */
  @Get(':couponId/qr')
  getQr(@CurrentUser() user: AuthenticatedUser, @Param('couponId') couponId: string) {
    return this.coupons.requestRedemptionToken(user.id, couponId);
  }

  /** §44: same token, rendered as a downloadable QR image — the frontend turns qrCodeDataUrl into a download link. */
  @Get(':couponId/qr/download')
  downloadQr(@CurrentUser() user: AuthenticatedUser, @Param('couponId') couponId: string) {
    return this.coupons.getQrImage(user.id, couponId);
  }
}

@ApiTags('me/business/coupons')
@UseGuards(BusinessOwnershipGuard, BusinessActiveGuard, BusinessCapabilityGuard)
@RequireCapability(BusinessCapabilityType.COUPONS)
@Controller('me/business/:businessId/coupons')
export class BusinessCouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get()
  list(@Param('businessId') businessId: string) {
    return this.coupons.listForBusiness(businessId);
  }

  /** §46: redemption history — kept ahead of the `:couponId` routes so "redemptions" is never mistaken for a coupon id. */
  @Get('redemptions')
  listRedemptions(@Param('businessId') businessId: string) {
    return this.coupons.listRedemptionsForBusiness(businessId);
  }

  @Get('redemptions/:redemptionId')
  getRedemption(@Param('businessId') businessId: string, @Param('redemptionId') redemptionId: string) {
    return this.coupons.getRedemptionForBusiness(businessId, redemptionId);
  }

  @Audit('business-coupon.create', 'BusinessCoupon')
  @Post()
  create(@Param('businessId') businessId: string, @Body() dto: CreateBusinessCouponDto) {
    return this.coupons.create(businessId, dto);
  }

  @Audit('business-coupon.update', 'BusinessCoupon')
  @Patch(':couponId')
  update(
    @Param('businessId') businessId: string,
    @Param('couponId') couponId: string,
    @Body() dto: UpdateBusinessCouponDto,
  ) {
    return this.coupons.update(businessId, couponId, dto);
  }

  @Audit('business-coupon.activate', 'BusinessCoupon')
  @Patch(':couponId/activate')
  activate(@Param('businessId') businessId: string, @Param('couponId') couponId: string) {
    return this.coupons.setStatus(businessId, couponId, BusinessCouponStatus.ACTIVE);
  }

  @Audit('business-coupon.pause', 'BusinessCoupon')
  @Patch(':couponId/pause')
  pause(@Param('businessId') businessId: string, @Param('couponId') couponId: string) {
    return this.coupons.setStatus(businessId, couponId, BusinessCouponStatus.PAUSED);
  }

  @Audit('business-coupon.cancel', 'BusinessCoupon')
  @Patch(':couponId/cancel')
  cancel(@Param('businessId') businessId: string, @Param('couponId') couponId: string) {
    return this.coupons.setStatus(businessId, couponId, BusinessCouponStatus.CANCELLED);
  }

  /** §46: dry run before the business commits to the redemption — same checks as redeem(), no write. */
  @Post('validate')
  validate(@Param('businessId') businessId: string, @Body() dto: ValidateCouponDto) {
    return this.coupons.validate(businessId, dto.token, { purchaseAmount: dto.purchaseAmount });
  }

  @Audit('business-coupon.redeem', 'CouponRedemption')
  @Post('redeem')
  redeem(@Param('businessId') businessId: string, @Body() dto: RedeemCouponDto) {
    return this.coupons.redeem(businessId, dto.token, {
      purchaseAmount: dto.purchaseAmount,
      petId: dto.petId,
    });
  }
}
