import { Injectable, NotFoundException } from '@nestjs/common';
import { resolvePagination } from '@bingoplus/utils';
import { PrismaService } from '../../prisma/prisma.service';

const AUDIT_LOG_INCLUDE = { actor: { select: { id: true, firstName: true, lastName: true, email: true } } } as const;

/** Read-only — AuditLog rows are written exclusively by AuditLogInterceptor (§27: "NO permitir
 * editar Audit Logs"). This service never creates/updates/deletes a row. */
@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: {
    entityType?: string;
    entityId?: string;
    actorUserId?: string;
    action?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    const { skip, take, page, pageSize } = resolvePagination(query);
    const where = {
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.action ? { action: { contains: query.action, mode: 'insensitive' as const } } : {}),
      ...(query.search
        ? {
            OR: [
              { action: { contains: query.search, mode: 'insensitive' as const } },
              { entityType: { contains: query.search, mode: 'insensitive' as const } },
              { entityId: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [total, logs] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: AUDIT_LOG_INCLUDE,
      }),
    ]);
    return { data: logs, meta: { page, pageSize, total } };
  }

  async getOne(id: string) {
    const log = await this.prisma.auditLog.findUnique({ where: { id }, include: AUDIT_LOG_INCLUDE });
    if (!log) throw new NotFoundException('Audit log not found');
    return log;
  }
}
