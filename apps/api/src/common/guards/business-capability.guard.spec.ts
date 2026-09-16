import { ForbiddenException } from '@nestjs/common';
import { BusinessCapabilityType } from '@prisma/client';
import { BusinessCapabilityGuard } from './business-capability.guard';
import { REQUIRE_CAPABILITY_KEY } from '../decorators/require-capability.decorator';
import { PrismaService } from '../../prisma/prisma.service';

function makeContext(businessId: string | undefined) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ params: { businessId } }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}

describe('BusinessCapabilityGuard (§23 — backend must protect capability-gated resources)', () => {
  let prisma: any;
  let reflector: any;
  let guard: BusinessCapabilityGuard;

  beforeEach(() => {
    prisma = { businessCapability: { findUnique: jest.fn() } };
    reflector = { get: jest.fn() };
    guard = new BusinessCapabilityGuard(prisma as unknown as PrismaService, reflector);
  });

  it('passes through routes with no @RequireCapability at all', async () => {
    reflector.get.mockReturnValue(undefined);
    await expect(guard.canActivate(makeContext('b1'))).resolves.toBe(true);
    expect(prisma.businessCapability.findUnique).not.toHaveBeenCalled();
  });

  it('rejects when the required capability is disabled for this business', async () => {
    reflector.get.mockReturnValue(BusinessCapabilityType.SELLS_PRODUCTS);
    prisma.businessCapability.findUnique.mockResolvedValue({ enabled: false });
    await expect(guard.canActivate(makeContext('b1'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects when the capability row does not exist at all (never granted)', async () => {
    reflector.get.mockReturnValue(BusinessCapabilityType.SELLS_PRODUCTS);
    prisma.businessCapability.findUnique.mockResolvedValue(null);
    await expect(guard.canActivate(makeContext('b1'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows the request through when the capability is enabled', async () => {
    reflector.get.mockReturnValue(BusinessCapabilityType.SELLS_PRODUCTS);
    prisma.businessCapability.findUnique.mockResolvedValue({ enabled: true });
    await expect(guard.canActivate(makeContext('b1'))).resolves.toBe(true);
    expect(prisma.businessCapability.findUnique).toHaveBeenCalledWith({
      where: { businessId_capability: { businessId: 'b1', capability: BusinessCapabilityType.SELLS_PRODUCTS } },
    });
  });

  it('reads handler-level metadata before falling back to class-level', async () => {
    reflector.get.mockReturnValueOnce(BusinessCapabilityType.COUPONS).mockReturnValueOnce(BusinessCapabilityType.SELLS_PRODUCTS);
    prisma.businessCapability.findUnique.mockResolvedValue({ enabled: true });
    await guard.canActivate(makeContext('b1'));
    expect(prisma.businessCapability.findUnique).toHaveBeenCalledWith({
      where: { businessId_capability: { businessId: 'b1', capability: BusinessCapabilityType.COUPONS } },
    });
  });
});
