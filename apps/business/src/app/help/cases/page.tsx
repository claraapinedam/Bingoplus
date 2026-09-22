'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';
import EmptyState from '@/components/EmptyState';
import { apiFetch } from '@/lib/api';

interface SupportCaseRow {
  id: string;
  code: string;
  subject: string;
  status: 'RECEIVED' | 'IN_PROGRESS' | 'CLOSED';
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = { RECEIVED: 'Recibido', IN_PROGRESS: 'En progreso', CLOSED: 'Cerrado' };

function MyCasesContent() {
  const router = useRouter();
  const [cases, setCases] = useState<SupportCaseRow[] | null>(null);

  useEffect(() => {
    apiFetch<SupportCaseRow[]>('/me/support/cases')
      .then(setCases)
      .catch(() => setCases([]));
  }, []);

  return (
    <>
      <button className="bingo-button secondary small" style={{ marginBottom: 16, width: 'auto' }} onClick={() => router.push('/help')}>
        ← Ayuda
      </button>
      <header className="dashboard-page-header">
        <div className="dashboard-page-title">Mis casos de soporte</div>
      </header>

      {cases === null ? (
        <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
      ) : cases.length === 0 ? (
        <EmptyState title="No has enviado ningún caso" subtitle="Los casos que envíes por 'Soporte con la aplicación' aparecerán aquí." />
      ) : (
        <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {cases.map((c) => (
            <a
              key={c.id}
              href={`/help/case/${c.id}`}
              className="bingo-card"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none' }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{c.subject}</div>
                <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 2 }}>
                  {c.code} · {new Date(c.createdAt).toLocaleDateString('es-EC')}
                </div>
              </div>
              <span className={`bingo-badge badge-${c.status.toLowerCase()}`}>{STATUS_LABELS[c.status]}</span>
            </a>
          ))}
        </div>
      )}
    </>
  );
}

export default function MySupportCasesPage() {
  return (
    <DashboardShell>
      <MyCasesContent />
    </DashboardShell>
  );
}
