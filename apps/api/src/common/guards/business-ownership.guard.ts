import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Ensures a BUSINESS_OWNER/BUSINESS_MANAGER caller can only act on the Business identified by
 * the route's :businessId param when they're actually a member of it (BusinessUser — OWNER or
 * MANAGER; `Business.ownerId` is only the denormalized legal-owner pointer, not the access-control
 * source). ADMIN/SUPER_ADMIN bypass this check. See docs/08-roles-permissions.md.
 *
 * This does not yet distinguish OWNER-only actions from MANAGER-allowed ones (e.g. staff
 * management, finance) — both pass today. Documented as a follow-up in the RBAC matrix rather
 * than silently assumed away.
 */
@Injectable()
export class BusinessOwnershipGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser = request.user;
    const businessId: string | undefined = request.params?.businessId ?? request.params?.id;

    if (user.roles.includes(RoleName.ADMIN) || user.roles.includes(RoleName.SUPER_ADMIN)) {
      return true;
    }

    if (!businessId) {
      throw new ForbiddenException('Missing business scope');
    }

    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true },
    });
    if (!business) {
      throw new NotFoundException('Business not found');
    }

    const membership = await this.prisma.businessUser.findUnique({
      where: { businessId_userId: { businessId, userId: user.id } },
    });
    if (!membership) {
      throw new ForbiddenException('You do not have access to this business');
    }

    return true;
  }
}
