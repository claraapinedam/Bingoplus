import { ForbiddenException } from '@nestjs/common';
import { BusinessStatus, RoleName } from '@prisma/client';
import { BusinessActiveGuard } from './business-active.guard';
import { PrismaService } from '../../prisma/prisma.service';

function makeContext(userRoles: RoleName[], businessId: string | undefined) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: { id: 'u1', roles: userRoles }, params: { businessId } }),
    }),
  } as any;
}

describe('BusinessActiveGuard — blocks operational writes before a business is ACTIVE', () => {
  let prisma: any;
  let guard: BusinessActiveGuard;

  beforeEach(() => {
    prisma = { business: { findUnique: jest.fn() } };
    guard = new BusinessActiveGuard(prisma as unknown as PrismaService);
  });

  it('lets ADMIN act regardless of the business status', async () => {
    await expect(guard.canActivate(makeContext([RoleName.ADMIN], 'b1'))).resolves.toBe(true);
    expect(prisma.business.findUnique).not.toHaveBeenCalled();
  });

  it('lets SUPER_ADMIN act regardless of the business status', async () => {
    await expect(guard.canActivate(makeContext([RoleName.SUPER_ADMIN], 'b1'))).resolves.toBe(true);
    expect(prisma.business.findUnique).not.toHaveBeenCalled();
  });

  it('rejects when no :businessId/:id route param is present', async () => {
    await expect(guard.canActivate(makeContext([RoleName.BUSINESS_OWNER], undefined))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects a PENDING business — SELLS_PRODUCTS being granted at apply() time is not enough', async () => {
    prisma.business.findUnique.mockResolvedValue({ status: BusinessStatus.PENDING });
    await expect(guard.canActivate(makeContext([RoleName.BUSINESS_OWNER], 'b1'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects an APPROVED-but-not-yet-signed business', async () => {
    prisma.business.findUnique.mockResolvedValue({ status: BusinessStatus.APPROVED });
    await expect(guard.canActivate(makeContext([RoleName.BUSINESS_OWNER], 'b1'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects a SUSPENDED business', async () => {
    prisma.business.findUnique.mockResolvedValue({ status: BusinessStatus.SUSPENDED });
    await expect(guard.canActivate(makeContext([RoleName.BUSINESS_OWNER], 'b1'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows an ACTIVE business', async () => {
    prisma.business.findUnique.mockResolvedValue({ status: BusinessStatus.ACTIVE });
    await expect(guard.canActivate(makeContext([RoleName.BUSINESS_OWNER], 'b1'))).resolves.toBe(true);
  });
});
