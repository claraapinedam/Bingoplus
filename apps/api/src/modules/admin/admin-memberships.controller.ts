import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { MembershipsService } from '../memberships/memberships.service';
import { CreateMembershipPlanDto, UpdateMembershipPlanDto } from '../memberships/dto/membership-plan.dto';
import { SetMembershipStatusDto } from '../memberships/dto/set-membership-status.dto';
import {
  ListMembershipPaymentsQueryDto,
  RejectMembershipPaymentDto,
} from '../memberships/dto/membership-payment.dto';

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

/** Admin review queue for manual membership-payment proofs (deposit receipt + admin verification
 * — see the MembershipPayment model comment). Structurally identical to
 * RefundService.completeManual/AdminPaymentsController's refund-completion flow: a business
 * submits a receipt, it sits PENDING, an admin reviews the receipt image and marks it VERIFIED or
 * REJECTED (with a reason). */
@ApiTags('admin/membership-payments')
@Roles(RoleName.ADMIN, RoleName.SUPER_ADMIN, RoleName.USER)
@UseGuards(RolesGuard)
@Controller('admin/membership-payments')
export class AdminMembershipPaymentsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get()
  list(@Query() query: ListMembershipPaymentsQueryDto) {
    return this.memberships.listPayments(query.status);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.memberships.getPayment(id);
  }

  @Audit('membership.payment.verify', 'MembershipPayment')
  @Post(':id/verify')
  verify(@CurrentUser() admin: AuthenticatedUser, @Param('id') id: string) {
    return this.memberships.verifyPayment(id, admin.id);
  }

  @Audit('membership.payment.reject', 'MembershipPayment')
  @Post(':id/reject')
  reject(@CurrentUser() admin: AuthenticatedUser, @Param('id') id: string, @Body() dto: RejectMembershipPaymentDto) {
    return this.memberships.rejectPayment(id, admin.id, dto.reason);
  }
}
