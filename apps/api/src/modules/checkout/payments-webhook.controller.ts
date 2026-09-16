import { BadRequestException, Controller, Headers, Param, Post, RawBodyRequest, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { PaymentService } from '../payments/payment.service';
import { CheckoutService } from './checkout.service';
import { BookingsService } from '../bookings/bookings.service';

/**
 * §22: provider webhooks are unauthenticated by nature (the provider isn't a logged-in BINGO+
 * user) — signature verification (PaymentService.processWebhook) is what stands in for auth
 * here, not JwtAuthGuard.
 *
 * FASE 9 §1: a Payment now settles either an Order or a Booking — this is the one place that
 * decides which sync to run, exactly mirroring how CheckoutService.confirm() already does it
 * synchronously for the direct (non-webhook) path.
 */
@ApiTags('payments/webhooks')
@Controller('payments/webhooks')
export class PaymentsWebhookController {
  constructor(
    private readonly payments: PaymentService,
    private readonly checkout: CheckoutService,
    private readonly bookings: BookingsService,
  ) {}

  @Public()
  @Post(':provider')
  async handle(
    @Param('provider') provider: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-webhook-signature') signature: string | undefined,
  ) {
    if (!req.rawBody) throw new BadRequestException('Missing request body');
    const rawBody = req.rawBody.toString('utf8');

    const { payment, duplicate } = await this.payments.processWebhook(provider, rawBody, signature);
    if (!duplicate && payment) {
      if (payment.orderId) {
        await this.checkout.syncOrderFromPaymentStatus(payment.orderId, payment.status);
      } else if (payment.bookingId) {
        await this.bookings.syncFromPaymentStatus(payment.bookingId, payment.status);
      }
    }
    return { received: true, duplicate };
  }
}
