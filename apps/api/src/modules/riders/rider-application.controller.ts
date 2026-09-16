import { Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RiderProfileService } from './rider-profile.service';

/**
 * Deliberately separate from RiderProfileController (which is gated by `@Roles(RoleName.RIDER)`)
 * — applying to become a rider is the one action a plain CUSTOMER must be able to take without
 * already holding the RIDER role. Any authenticated user can call this (global JwtAuthGuard still
 * applies; there's just no role restriction on top of it here).
 */
@ApiTags('rider/application')
@Controller('rider')
export class RiderApplicationController {
  constructor(private readonly profile: RiderProfileService) {}

  @Post('apply')
  apply(@CurrentUser() user: AuthenticatedUser) {
    return this.profile.applyAsRider(user.id);
  }
}
