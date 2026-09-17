import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ReviewTargetType } from '@prisma/client';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { BusinessOwnershipGuard } from '../../common/guards/business-ownership.guard';
import { ReviewsService } from './reviews.service';
import { CreateOrderReviewsDto } from './dto/create-order-reviews.dto';
import { CreateBookingReviewDto } from './dto/create-booking-review.dto';
import { ReportReviewDto } from './dto/report-review.dto';
import { BusinessReplyDto } from './dto/business-reply.dto';

@ApiTags('orders/reviews')
@Controller('orders')
export class OrderReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get(':id/reviews')
  getContext(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.reviews.getContextForOrder(user.id, id);
  }

  @Audit('order.review.submit', 'Order')
  @Post(':id/reviews')
  submit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CreateOrderReviewsDto) {
    return this.reviews.submitForOrder(user.id, id, dto);
  }
}

@ApiTags('bookings/reviews')
@Controller('bookings')
export class BookingReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get(':id/reviews')
  getContext(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.reviews.getContextForBooking(user.id, id);
  }

  @Audit('booking.review.submit', 'Booking')
  @Post(':id/reviews')
  submit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CreateBookingReviewDto) {
    return this.reviews.submitForBooking(user.id, id, dto);
  }
}

@ApiTags('pet-friendly-places/reviews')
@Controller('pet-friendly-places')
export class PetFriendlyPlaceReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Get(':id/reviews')
  list(@Param('id') id: string) {
    return this.reviews.listPublishedForPlace(id);
  }

  @Audit('pet_friendly_place.review.submit', 'PetFriendlyPlace')
  @Post(':id/reviews')
  submit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CreateBookingReviewDto) {
    return this.reviews.submitForPlace(user.id, id, dto);
  }
}

/** Any authenticated user may report a review — no ownership guard, the eligibility that matters
 * here is just "logged in", same as any abuse-report surface. */
@ApiTags('reviews')
@Controller('reviews')
export class ReviewReportController {
  constructor(private readonly reviews: ReviewsService) {}

  @Audit('review.report', 'Review')
  @Post(':id/report')
  report(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ReportReviewDto) {
    return this.reviews.report(user.id, id, dto);
  }
}

@ApiTags('business/reviews')
@UseGuards(BusinessOwnershipGuard)
@Controller('business/:businessId/reviews')
export class BusinessReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  list(@Param('businessId') businessId: string, @Query('targetType') targetType?: ReviewTargetType) {
    return this.reviews.listForBusiness(businessId, { targetType });
  }

  @Audit('review.reply', 'Review')
  @Patch(':id/reply')
  reply(@Param('businessId') businessId: string, @Param('id') id: string, @Body() dto: BusinessReplyDto) {
    return this.reviews.reply(businessId, id, dto);
  }
}
