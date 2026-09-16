import { NotFoundException } from '@nestjs/common';
import { AuditLogsService } from './audit-logs.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AuditLogsService (§27 — read-only, never editable)', () => {
  let service: AuditLogsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      auditLog: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn(),
      },
      $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
    };
    service = new AuditLogsService(prisma as unknown as PrismaService);
  });

  it('has no create/update/delete method at all — the service surface itself enforces immutability', () => {
    expect((service as any).create).toBeUndefined();
    expect((service as any).update).toBeUndefined();
    expect((service as any).delete).toBeUndefined();
  });

  it('list() paginates and filters by entityType/entityId/actorUserId', async () => {
    await service.list({ entityType: 'Business', entityId: 'b1', actorUserId: 'admin-1' });
    expect(prisma.auditLog.findMany.mock.calls[0][0].where).toMatchObject({
      entityType: 'Business',
      entityId: 'b1',
      actorUserId: 'admin-1',
    });
  });

  it('list() orders newest first', async () => {
    await service.list({});
    expect(prisma.auditLog.findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'desc' });
  });

  it('getOne() 404s on an unknown log id', async () => {
    prisma.auditLog.findUnique.mockResolvedValue(null);
    await expect(service.getOne('ghost')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getOne() includes the actor for display', async () => {
    prisma.auditLog.findUnique.mockResolvedValue({ id: 'log1', actor: { firstName: 'A' } });
    const result = await service.getOne('log1');
    expect(result.actor).toEqual({ firstName: 'A' });
  });
});
