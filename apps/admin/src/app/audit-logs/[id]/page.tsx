'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminShell from '@/components/AdminShell';
import { apiFetch, ApiError } from '@/lib/api';

interface AuditLogDetail {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  previousValue: unknown;
  newValue: unknown;
  metadata: unknown;
  ipAddress: string | null;
  createdAt: string;
  actor: { firstName: string; lastName: string; email: string } | null;
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <pre
        style={{
          background: '#f7f9fb',
          borderRadius: 10,
          padding: 12,
          fontSize: 11,
          overflowX: 'auto',
          margin: 0,
          maxHeight: 260,
        }}
      >
        {value == null ? '—' : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export default function AdminAuditLogDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [log, setLog] = useState<AuditLogDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<AuditLogDetail>(`/admin/audit-logs/${params.id}`)
      .then(setLog)
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'No se pudo cargar el registro.');
        setLog(null);
      });
  }, [params.id]);

  if (log === undefined) {
    return (
      <AdminShell>
        <p>Cargando…</p>
      </AdminShell>
    );
  }
  if (!log) {
    return (
      <AdminShell>
        <div className="bingo-card" style={{ color: 'var(--bingo-error)' }}>{error ?? 'Registro no encontrado.'}</div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <button className="bingo-button secondary" style={{ marginBottom: 16, padding: '8px 14px', fontSize: 13 }} onClick={() => router.push('/audit-logs')}>
        ← Volver a Auditoría
      </button>

      <h1 className="bingo-page-title">{log.action}</h1>
      <p className="bingo-page-subtitle">
        {log.entityType} · {log.entityId} · {new Date(log.createdAt).toLocaleString('es-EC')}
      </p>

      <div className="bingo-card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, marginBottom: 4 }}>
          Actor: {log.actor ? `${log.actor.firstName} ${log.actor.lastName} (${log.actor.email})` : 'Sistema'}
        </div>
        {log.ipAddress && <div style={{ fontSize: 13 }}>IP: {log.ipAddress}</div>}
      </div>

      <div className="bingo-card">
        <JsonBlock label="Valor anterior" value={log.previousValue} />
        <JsonBlock label="Valor nuevo" value={log.newValue} />
        <JsonBlock label="Metadata (request)" value={log.metadata} />
      </div>
    </AdminShell>
  );
}
