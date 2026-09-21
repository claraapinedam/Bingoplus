import { Body, Controller, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { CommissionCouponsService } from './commission-coupons.service';
import { RedeemCommissionCouponDto } from './dto/redeem-commission-coupon.dto';

/** Always "my own" rider row — same convention as RiderContractsController. */
@ApiTags('me/rider/commission-coupons')
@Roles(RoleName.RIDER)
@UseGuards(RolesGuard)
@Controller('me/rider/commission-coupons')
export class RiderCommissionCouponsController {
  constructor(
    private readonly commissionCoupons: CommissionCouponsService,
    private readonly prisma: PrismaService,
  ) {}

  private async getOwnRiderId(userId: string): Promise<string> {
    const rider = await this.prisma.rider.findUnique({ where: { userId }, select: { id: true } });
    if (!rider) throw new NotFoundException('Rider profile not found');
    return rider.id;
  }

  @Post('redeem')
  async redeem(@CurrentUser() user: AuthenticatedUser, @Body() dto: RedeemCommissionCouponDto) {
    const riderId = await this.getOwnRiderId(user.id);
    return this.commissionCoupons.redeemForRider(riderId, dto.code);
  }
}
