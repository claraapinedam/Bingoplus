import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';
import { AUDIT_KEY, AuditMeta } from '../decorators/audit.decorator';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Resolves the "before" snapshot for an audited entityType. Most entities are looked up by their
 * own `id` (the default, added below for every entityType that doesn't need an override) — these
 * two need an override because their natural key isn't `id`: BusinessCapability is a per-business
 * set of rows (not a single row), and BusinessMembership is keyed by the owning business.
 */
const PREVIOUS_VALUE_OVERRIDES: Record<string, (prisma: PrismaService, entityId: string) => Promise<unknown>> = {
  BusinessCapability: (prisma, businessId) =>
    prisma.businessCapability.findMany({ where: { businessId } }),
  BusinessMembership: (prisma, businessId) =>
    prisma.businessMembership.findUnique({ where: { businessId } }),
};

/** `EntityType` -> the PrismaClient delegate property holding it (`Business` -> `prisma.business`). */
function delegateName(entityType: string): string {
  return entityType.charAt(0).toLowerCase() + entityType.slice(1);
}

/**
 * Writes an AuditLog row after a route decorated with @Audit() completes successfully, including
 * a best-effort previousValue/newValue diff (RULE 19). Append-only, best-effort throughout: a
 * lookup failure or a logging failure never fails the underlying request — audit trail quality
 * must never become a reason a real user-facing action breaks.
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMeta | undefined>(AUDIT_KEY, context.getHandler());

    if (!meta) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;
    const entityId: string = request.params?.id ?? request.params?.businessId ?? 'unknown';

    const previousValuePromise = this.fetchPreviousValue(meta.entityType, entityId);

    return next.handle().pipe(
      tap((result) => {
        previousValuePromise
          .then((previousValue) =>
            this.prisma.auditLog.create({
              data: {
                actorUserId: user?.id,
                action: meta.action,
                entityType: meta.entityType,
                entityId,
                previousValue: (previousValue ?? undefined) as any,
                newValue: (result ?? undefined) as any,
                metadata: { params: request.params, body: request.body },
                ipAddress: request.ip,
              },
            }),
          )
          .catch(() => undefined);
      }),
    );
  }

  /**
   * Best-effort "before" snapshot, taken before the handler runs. Returns null (never throws) for
   * a create — where entityId doesn't identify an existing row yet — or for any entityType this
   * interceptor doesn't know how to look up.
   */
  private async fetchPreviousValue(entityType: string, entityId: string): Promise<unknown> {
    if (entityId === 'unknown') return null;
    try {
      const override = PREVIOUS_VALUE_OVERRIDES[entityType];
      if (override) return await override(this.prisma, entityId);

      const delegate = (this.prisma as any)[delegateName(entityType)];
      if (!delegate?.findUnique) return null;
      return await delegate.findUnique({ where: { id: entityId } });
    } catch {
      return null;
    }
  }
}
