import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { BusinessStatus, RoleName } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Blocks owner-facing operational writes (create a product, a service, a promotion, a coupon,
 * change delivery settings, ...) until the business is actually ACTIVE. BusinessOwnershipGuard
 * (membership) and BusinessCapabilityGuard (e.g. SELLS_PRODUCTS) both pass long before that —
 * SELLS_PRODUCTS in particular is granted at apply() time, the moment a business is created,
 * well before Admin even reviews the application, let alone before its contract is signed. This
 * is the guard that actually closes that gap. ADMIN/SUPER_ADMIN bypass, same as
 * BusinessOwnershipGuard — an admin operating on a business's behalf isn't blocked by its own
 * onboarding status.
 */
@Injectable()
export class BusinessActiveGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser = request.user;

    if (user.roles.includes(RoleName.ADMIN) || user.roles.includes(RoleName.SUPER_ADMIN)) {
      return true;
    }

    const businessId: string | undefined = request.params?.businessId ?? request.params?.id;
    if (!businessId) {
      throw new ForbiddenException('Missing business scope');
    }

    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { status: true },
    });
    if (!business || business.status !== BusinessStatus.ACTIVE) {
      throw new ForbiddenException('This business is not active yet — it must be approved and its contract signed first');
    }

    return true;
  }
}
