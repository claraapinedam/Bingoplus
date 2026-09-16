import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit';

export interface AuditMeta {
  action: string;
  entityType: string;
}

/** Marks a mutating admin/business route for automatic AuditLog recording (see AuditLogInterceptor). */
export const Audit = (action: string, entityType: string) =>
  SetMetadata(AUDIT_KEY, { action, entityType } as AuditMeta);
