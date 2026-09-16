import { Module } from '@nestjs/common';
import { PetsModule } from '../pets/pets.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { BookingsService } from './bookings.service';
import { PublicAvailabilityController, CustomerBookingsController, BusinessBookingsController } from './bookings.controller';

@Module({
  imports: [PetsModule, NotificationsModule, PaymentsModule],
  controllers: [PublicAvailabilityController, CustomerBookingsController, BusinessBookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
