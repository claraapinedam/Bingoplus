import { Module } from '@nestjs/common';
import { CheckoutController } from './checkout.controller';
import { PaymentsWebhookController } from './payments-webhook.controller';
import { CheckoutService } from './checkout.service';
import { BusinessCapabilitiesModule } from '../business-capabilities/business-capabilities.module';
import { PricingModule } from '../pricing/pricing.module';
import { PaymentsModule } from '../payments/payments.module';
import { OrdersModule } from '../orders/orders.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BookingsModule } from '../bookings/bookings.module';

@Module({
  imports: [BusinessCapabilitiesModule, PricingModule, PaymentsModule, OrdersModule, NotificationsModule, BookingsModule],
  controllers: [CheckoutController, PaymentsWebhookController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
