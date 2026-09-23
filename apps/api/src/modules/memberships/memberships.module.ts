import { Module } from '@nestjs/common';
import {
  PublicMembershipPlansController,
  BusinessMembershipController,
} from './memberships.controller';
import { MembershipsService } from './memberships.service';
import { MembershipPastDueSweeper } from './membership-past-due.sweeper';

@Module({
  controllers: [PublicMembershipPlansController, BusinessMembershipController],
  providers: [MembershipsService, MembershipPastDueSweeper],
  exports: [MembershipsService],
})
export class MembershipsModule {}
