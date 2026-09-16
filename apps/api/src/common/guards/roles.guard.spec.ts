import { ForbiddenException } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { RolesGuard } from './roles.guard';

function makeContext(requiredRoles: RoleName[] | undefined, userRoles: RoleName[] | undefined) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user: userRoles ? { id: 'u1', roles: userRoles } : undefined }),
    }),
    // consumed by reflector.getAllAndOverride, mocked separately below
    __requiredRoles: requiredRoles,
  } as any;
}

describe('RolesGuard (RBAC)', () => {
  function makeGuard(requiredRoles: RoleName[] | undefined) {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(requiredRoles) };
    return { guard: new RolesGuard(reflector as any), reflector };
  }

  it('allows any authenticated request when a route declares no @Roles at all', () => {
    const { guard } = makeGuard(undefined);
    expect(guard.canActivate(makeContext(undefined, [RoleName.CUSTOMER]))).toBe(true);
  });

  it('allows a CUSTOMER through a route that requires CUSTOMER', () => {
    const { guard } = makeGuard([RoleName.CUSTOMER]);
    expect(guard.canActivate(makeContext([RoleName.CUSTOMER], [RoleName.CUSTOMER]))).toBe(true);
  });

  it('rejects a CUSTOMER on a route that requires ADMIN', () => {
    const { guard } = makeGuard([RoleName.ADMIN]);
    expect(() => guard.canActivate(makeContext([RoleName.ADMIN], [RoleName.CUSTOMER]))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects an unauthenticated request on a role-restricted route', () => {
    const { guard } = makeGuard([RoleName.ADMIN]);
    expect(() => guard.canActivate(makeContext([RoleName.ADMIN], undefined))).toThrow(ForbiddenException);
  });

  it('allows BUSINESS_MANAGER on a route that accepts either business role', () => {
    const { guard } = makeGuard([RoleName.BUSINESS_OWNER, RoleName.BUSINESS_MANAGER]);
    expect(
      guard.canActivate(
        makeContext([RoleName.BUSINESS_OWNER, RoleName.BUSINESS_MANAGER], [RoleName.BUSINESS_MANAGER]),
      ),
    ).toBe(true);
  });

  it('rejects a RIDER on a route restricted to SUPER_ADMIN', () => {
    const { guard } = makeGuard([RoleName.SUPER_ADMIN]);
    expect(() => guard.canActivate(makeContext([RoleName.SUPER_ADMIN], [RoleName.RIDER]))).toThrow(
      ForbiddenException,
    );
  });
});
