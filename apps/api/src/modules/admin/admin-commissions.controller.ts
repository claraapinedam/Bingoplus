import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BusinessesService } from '../businesses/businesses.service';

/** §26 — real GMV × current commission rate per business, never a fabricated figure. Separate
 * from Membership financials (see AdminMembershipPlansController / AdminBusinessMembershipController). */
@ApiTags('admin/commissions')
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN)
@UseGuards(RolesGuard)
@Controller('admin/commissions')
export class AdminCommissionsController {
  constructor(private readonly businesses: BusinessesService) {}

  @Get()
  list() {
    return this.businesses.listCommissionsForAdmin();
  }
}
