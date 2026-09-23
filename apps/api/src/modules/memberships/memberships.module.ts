import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { PricingModule } from '../pricing/pricing.module';
import {
  PublicMembershipPlansController,
  BusinessMembershipController,
} from './memberships.controller';
import { MembershipsService } from './memberships.service';
import { MembershipPastDueSweeper } from './membership-past-due.sweeper';

@Module({
  imports: [PaymentsModule, PricingModule],
  controllers: [PublicMembershipPlansController, BusinessMembershipController],
  providers: [MembershipsService, MembershipPastDueSweeper],
  exports: [MembershipsService],
})
export class MembershipsModule {}
