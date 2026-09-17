import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { MembershipsService } from '../memberships/memberships.service';
import { CreateMembershipPlanDto, UpdateMembershipPlanDto } from '../memberships/dto/membership-plan.dto';
import { SetMembershipStatusDto } from '../memberships/dto/set-membership-status.dto';

@ApiTags('admin/membership-plans')
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN, RoleName.USER)
@UseGuards(RolesGuard)
@Controller('admin/membership-plans')
export class AdminMembershipPlansController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get()
  list() {
    return this.memberships.listPlans();
  }

  @Audit('membership-plan.create', 'MembershipPlan')
  @Post()
  create(@Body() dto: CreateMembershipPlanDto) {
    return this.memberships.createPlan(dto);
  }

  @Audit('membership-plan.update', 'MembershipPlan')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMembershipPlanDto) {
    return this.memberships.updatePlan(id, dto);
  }
}

@ApiTags('admin/businesses/membership')
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN, RoleName.USER)
@UseGuards(RolesGuard)
@Controller('admin/businesses/:id/membership')
export class AdminBusinessMembershipController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get()
  get(@Param('id') id: string) {
    return this.memberships.getForBusiness(id);
  }

  @Audit('membership.status.update', 'BusinessMembership')
  @Patch('status')
  setStatus(@Param('id') id: string, @Body() dto: SetMembershipStatusDto) {
    return this.memberships.setStatus(id, dto.status);
  }
}
