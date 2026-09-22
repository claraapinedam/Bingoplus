import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PayoutsService } from '../payouts/payouts.service';
import { MarkPayoutsPaidDto } from '../payouts/dto/mark-payouts-paid.dto';

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

  @Get('businesses/pending')
  listPendingBusinesses() {
    return this.payouts.listPendingBusinesses();
  }

  @Audit('payout.businesses.mark_paid', 'Payout')
  @Post('businesses/mark-paid')
  markBusinessesPaid(@CurrentUser() admin: AuthenticatedUser, @Body() dto: MarkPayoutsPaidDto) {
    return this.payouts.markBusinessesPaid(dto.ids, admin.id);
  }
}
