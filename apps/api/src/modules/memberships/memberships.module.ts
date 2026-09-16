import { Module } from '@nestjs/common';
import {
  PublicMembershipPlansController,
  BusinessMembershipController,
} from './memberships.controller';
import { MembershipsService } from './memberships.service';

@Module({
  controllers: [PublicMembershipPlansController, BusinessMembershipController],
  providers: [MembershipsService],
  exports: [MembershipsService],
})
export class MembershipsModule {}
