import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BusinessCapabilityType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { REQUIRE_CAPABILITY_KEY } from '../decorators/require-capability.decorator';

/**
 * §23 (FASE 5): "no basta con ocultar botones" — hiding a nav item in the Business Portal is a
 * frontend convenience, never the real authorization. This guard is the backend half: a business
 * without SELLS_PRODUCTS enabled gets a 403 from /business/:businessId/products even if it knows
 * the URL directly, same as it already gets one from BusinessOwnershipGuard for a business it
 * doesn't belong to. Runs alongside BusinessOwnershipGuard, not instead of it — this only checks
 * the capability flag, membership is still BusinessOwnershipGuard's job.
 */
@Injectable()
export class BusinessCapabilityGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required =
      this.reflector.get<BusinessCapabilityType | undefined>(REQUIRE_CAPABILITY_KEY, context.getHandler()) ??
      this.reflector.get<BusinessCapabilityType | undefined>(REQUIRE_CAPABILITY_KEY, context.getClass());
    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const businessId: string | undefined = request.params?.businessId ?? request.params?.id;
    if (!businessId) return true; // BusinessOwnershipGuard already rejects a missing businessId

    const row = await this.prisma.businessCapability.findUnique({
      where: { businessId_capability: { businessId, capability: required } },
    });
    if (!row?.enabled) {
      throw new ForbiddenException(`This business does not have the ${required} capability enabled`);
    }
    return true;
  }
}
