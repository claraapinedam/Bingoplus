import { SetMetadata } from '@nestjs/common';
import { BusinessCapabilityType } from '@prisma/client';

export const REQUIRE_CAPABILITY_KEY = 'requireCapability';

/** Pairs with BusinessCapabilityGuard — marks a controller/route as needing a specific
 * BusinessCapability enabled, on top of BusinessOwnershipGuard's plain membership check. */
export const RequireCapability = (capability: BusinessCapabilityType) => SetMetadata(REQUIRE_CAPABILITY_KEY, capability);
