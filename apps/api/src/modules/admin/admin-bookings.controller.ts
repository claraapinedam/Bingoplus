import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BookingsService } from '../bookings/bookings.service';
import { ListAdminBookingsQueryDto } from '../bookings/dto/list-bookings-query.dto';

/** Global read-only booking visibility (FASE 7 §33) — Customer and Business keep their own
 * Booking management surfaces, admin only supervises here, never a second Booking UI. */
@ApiTags('admin/bookings')
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN, RoleName.USER)
@UseGuards(RolesGuard)
@Controller('admin/bookings')
export class AdminBookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get()
  list(@Query() query: ListAdminBookingsQueryDto) {
    return this.bookingsService.listForAdmin(query);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.bookingsService.getForAdmin(id);
  }
}
