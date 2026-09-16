import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  OrderReviewsController,
  BookingReviewsController,
  ReviewReportController,
  BusinessReviewsController,
} from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [NotificationsModule],
  controllers: [OrderReviewsController, BookingReviewsController, ReviewReportController, BusinessReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
