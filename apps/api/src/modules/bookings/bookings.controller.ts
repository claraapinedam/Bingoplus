import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BusinessCapabilityType } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { BusinessOwnershipGuard } from '../../common/guards/business-ownership.guard';
import { BusinessCapabilityGuard } from '../../common/guards/business-capability.guard';
import { RequireCapability } from '../../common/decorators/require-capability.decorator';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { AvailabilityQueryDto } from './dto/availability-query.dto';
import { CancelBookingDto, ListBusinessBookingsQueryDto, ListCustomerBookingsQueryDto } from './dto/list-bookings-query.dto';
import { ConfirmBookingPaymentDto, CreateBookingPaymentDto } from './dto/booking-payment.dto';
import { CreateManualBookingBlockDto } from './dto/manual-block.dto';
import { CalendarQueryDto } from './dto/calendar-query.dto';

@ApiTags('public/services/availability')
@Controller('public/services/:serviceId/availability')
export class PublicAvailabilityController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Public()
  @Get()
  get(@Param('serviceId') serviceId: string, @Query() query: AvailabilityQueryDto) {
    return this.bookingsService.getAvailableSlots(serviceId, query.date);
  }
}

@ApiTags('me/bookings')
@Controller('me/bookings')
export class CustomerBookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListCustomerBookingsQueryDto) {
    return this.bookingsService.listForCustomer(user.id, query);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.bookingsService.getForCustomer(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBookingDto) {
    return this.bookingsService.create(user.id, dto);
  }

  @Patch(':id/cancel')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CancelBookingDto) {
    return this.bookingsService.cancelForCustomer(user.id, id, dto.reason);
  }

  @Audit('booking.create-payment', 'Booking')
  @Post(':id/payment')
  createPayment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CreateBookingPaymentDto) {
    return this.bookingsService.createBookingPayment(user.id, id, dto.idempotencyKey);
  }

  @Get(':id/payment')
  getPayment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.bookingsService.getBookingPayment(user.id, id);
  }

  @Audit('booking.confirm-payment', 'Booking')
  @Post(':id/payment/confirm')
  confirmPayment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ConfirmBookingPaymentDto) {
    return this.bookingsService.confirmBookingPayment(user.id, id, dto.simulateFailure);
  }
}

@ApiTags('business/bookings')
@UseGuards(BusinessOwnershipGuard, BusinessCapabilityGuard)
@RequireCapability(BusinessCapabilityType.BOOKINGS)
@Controller('business/:businessId/bookings')
export class BusinessBookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get()
  list(@Param('businessId') businessId: string, @Query() query: ListBusinessBookingsQueryDto) {
    return this.bookingsService.listForBusiness(businessId, query);
  }

  // Must come before @Get(':id') — otherwise "calendar" would be swallowed as an :id lookup.
  @Get('calendar')
  calendar(@Param('businessId') businessId: string, @Query() query: CalendarQueryDto) {
    return this.bookingsService.getCalendar(businessId, query);
  }

  @Audit('booking.create-manual-block', 'Booking')
  @Post('blocks')
  createManualBlock(@Param('businessId') businessId: string, @Body() dto: CreateManualBookingBlockDto) {
    return this.bookingsService.createManualBlock(businessId, dto);
  }

  @Get(':id')
  getOne(@Param('businessId') businessId: string, @Param('id') id: string) {
    return this.bookingsService.getForBusiness(businessId, id);
  }

  @Audit('booking.confirm', 'Booking')
  @Patch(':id/confirm')
  confirm(@Param('businessId') businessId: string, @Param('id') id: string) {
    return this.bookingsService.confirm(businessId, id);
  }

  @Audit('booking.cancel', 'Booking')
  @Patch(':id/cancel')
  cancel(@Param('businessId') businessId: string, @Param('id') id: string, @Body() dto: CancelBookingDto) {
    return this.bookingsService.cancelForBusiness(businessId, id, dto.reason);
  }

  @Audit('booking.complete', 'Booking')
  @Patch(':id/complete')
  complete(@Param('businessId') businessId: string, @Param('id') id: string) {
    return this.bookingsService.complete(businessId, id);
  }

  @Audit('booking.no_show', 'Booking')
  @Patch(':id/no-show')
  noShow(@Param('businessId') businessId: string, @Param('id') id: string) {
    return this.bookingsService.markNoShow(businessId, id);
  }
}
