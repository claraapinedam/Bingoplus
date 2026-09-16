import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { BusinessOwnershipGuard } from './business-ownership.guard';
import { PrismaService } from '../../prisma/prisma.service';

function makeContext(userRoles: RoleName[], businessId: string | undefined) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: { id: 'u1', roles: userRoles }, params: { businessId } }),
    }),
  } as any;
}

describe('BusinessOwnershipGuard (RBAC — business scope)', () => {
  let prisma: any;
  let guard: BusinessOwnershipGuard;

  beforeEach(() => {
    prisma = {
      business: { findUnique: jest.fn() },
      businessUser: { findUnique: jest.fn() },
    };
    guard = new BusinessOwnershipGuard(prisma as unknown as PrismaService);
  });

  it('lets ADMIN act on any business without a membership check', async () => {
    await expect(guard.canActivate(makeContext([RoleName.ADMIN], 'b1'))).resolves.toBe(true);
    expect(prisma.businessUser.findUnique).not.toHaveBeenCalled();
  });

  it('lets SUPER_ADMIN act on any business without a membership check', async () => {
    await expect(guard.canActivate(makeContext([RoleName.SUPER_ADMIN], 'b1'))).resolves.toBe(true);
    expect(prisma.businessUser.findUnique).not.toHaveBeenCalled();
  });

  it('rejects when no :businessId/:id route param is present', async () => {
    await expect(guard.canActivate(makeContext([RoleName.BUSINESS_OWNER], undefined))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('404s when the business does not exist', async () => {
    prisma.business.findUnique.mockResolvedValue(null);
    await expect(guard.canActivate(makeContext([RoleName.BUSINESS_OWNER], 'ghost'))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects a BUSINESS_OWNER who is not a BusinessUser of that specific business', async () => {
    prisma.business.findUnique.mockResolvedValue({ id: 'b1' });
    prisma.businessUser.findUnique.mockResolvedValue(null);
    await expect(guard.canActivate(makeContext([RoleName.BUSINESS_OWNER], 'b1'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows a BUSINESS_MANAGER who is a BusinessUser of that business (access, not the owner-only distinction)', async () => {
    prisma.business.findUnique.mockResolvedValue({ id: 'b1' });
    prisma.businessUser.findUnique.mockResolvedValue({ businessId: 'b1', userId: 'u1', role: 'MANAGER' });
    await expect(guard.canActivate(makeContext([RoleName.BUSINESS_MANAGER], 'b1'))).resolves.toBe(true);
  });
});
