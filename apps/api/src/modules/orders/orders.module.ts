import { Module } from '@nestjs/common';
import { OrdersController, BusinessOrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderStateMachine } from './order-state-machine';
import { CancellationService } from './cancellation.service';
import { RefundService } from './refund.service';
import { PricingModule } from '../pricing/pricing.module';
import { PaymentsModule } from '../payments/payments.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PricingModule, PaymentsModule, NotificationsModule],
  controllers: [OrdersController, BusinessOrdersController],
  providers: [OrdersService, OrderStateMachine, CancellationService, RefundService],
  exports: [OrdersService, OrderStateMachine, RefundService],
})
export class OrdersModule {}
