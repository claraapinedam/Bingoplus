import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PayoutsService } from '../payouts/payouts.service';
import { MarkPayoutsPaidDto } from '../payouts/dto/mark-payouts-paid.dto';
import { MarkPayoutItemsPaidDto } from '../payouts/dto/mark-payout-items-paid.dto';
import { UpdatePayoutReferenceDto } from '../payouts/dto/update-payout-reference.dto';

/** "Pagos" — what BINGO+ still owes each rider/business, already net of commission/tax, and the
 * one action that moves a payee from pending to paid. See PayoutsService for the full design. */
@ApiTags('admin/payouts')
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN, RoleName.USER)
@UseGuards(RolesGuard)
@Controller('admin/payouts')
export class AdminPayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get('riders/pending')
  listPendingRiders() {
    return this.payouts.listPendingRiders();
  }

  @Audit('payout.riders.mark_paid', 'Payout')
  @Post('riders/mark-paid')
  markRidersPaid(@CurrentUser() admin: AuthenticatedUser, @Body() dto: MarkPayoutsPaidDto) {
    return this.payouts.markRidersPaid(dto.ids, admin.id);
  }

  @Get('riders/:riderId/pending')
  getRiderPending(@Param('riderId') riderId: string) {
    return this.payouts.getRiderPending(riderId);
  }

  @Get('riders/:riderId/history')
  getRiderPaidHistory(@Param('riderId') riderId: string) {
    return this.payouts.getRiderPaidHistory(riderId);
  }

  @Audit('payout.rider.mark_items_paid', 'Payout')
  @Post('riders/:riderId/mark-paid')
  markRiderEarningsPaid(@Param('riderId') riderId: string, @Body() dto: MarkPayoutItemsPaidDto) {
    return this.payouts.markRiderEarningsPaid(riderId, dto.ids, dto.referenceNumber);
  }

  @Get('businesses/pending')
  listPendingBusinesses() {
    return this.payouts.listPendingBusinesses();
  }

  @Audit('payout.businesses.mark_paid', 'Payout')
  @Post('businesses/mark-paid')
  markBusinessesPaid(@CurrentUser() admin: AuthenticatedUser, @Body() dto: MarkPayoutsPaidDto) {
    return this.payouts.markBusinessesPaid(dto.ids, admin.id);
  }

  @Get('businesses/:businessId/pending')
  getBusinessPending(@Param('businessId') businessId: string) {
    return this.payouts.getBusinessPending(businessId);
  }

  @Get('businesses/:businessId/history')
  getBusinessPaidHistory(@Param('businessId') businessId: string) {
    return this.payouts.getBusinessPaidHistory(businessId);
  }

  @Audit('payout.business.mark_items_paid', 'Payout')
  @Post('businesses/:businessId/mark-paid')
  markBusinessOrdersPaid(@Param('businessId') businessId: string, @Body() dto: MarkPayoutItemsPaidDto) {
    return this.payouts.markBusinessOrdersPaid(businessId, dto.ids, dto.referenceNumber);
  }

  @Audit('payout.update_reference', 'Payout')
  @Patch(':payoutId/reference')
  updateReference(@Param('payoutId') payoutId: string, @Body() dto: UpdatePayoutReferenceDto) {
    return this.payouts.updatePayoutReference(payoutId, dto.referenceNumber);
  }
}
