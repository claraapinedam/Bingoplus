import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma, RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PaymentService } from '../payments/payment.service';
import { RefundService } from '../orders/refund.service';
import { ListPaymentsAdminQueryDto } from './dto/list-query.dto';
import { AdminRefundDto } from './dto/admin-refund.dto';

/** Global read-only payment supervision (§20) + the one sanctioned admin write action, a refund
 * (§21) — reuses RefundService.refundOrder exactly as CancellationService already does (idempotent
 * via the same "can't exceed what was paid" guard), never a parallel refund system. Never returns
 * PAN/CVV/raw card data — this schema never stores that in the first place, so there's nothing to
 * accidentally leak here. */
@ApiTags('admin/payments')
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
@UseGuards(RolesGuard)
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(
    private readonly payments: PaymentService,
    private readonly refunds: RefundService,
  ) {}

  @Get()
  list(@Query() query: ListPaymentsAdminQueryDto) {
    return this.payments.listForAdmin(query);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.payments.getForAdmin(id);
  }

  @Audit('payment.refund', 'Payment')
  @Post(':id/refund')
  async refund(@CurrentUser() admin: AuthenticatedUser, @Param('id') id: string, @Body() dto: AdminRefundDto) {
    const payment = await this.payments.getForAdmin(id);
    // FASE 9 §1 scope boundary: Booking payments can be created/confirmed online, but refunding
    // one is deliberately out of scope this phase (documented as technical debt) — RefundService
    // only knows the Order flow today, and forcing a Booking through it would be exactly the
    // "reutilizar sin romper" violation the phase forbids.
    if (!payment.order) {
      throw new BadRequestException('Refunding a Booking payment is not supported yet — this payment is not attached to an Order.');
    }
    return this.refunds.refundOrder(payment.order.id, new Prisma.Decimal(dto.amount), dto.reason, admin.id);
  }
}
