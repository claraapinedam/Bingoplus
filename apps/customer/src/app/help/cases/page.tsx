'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CustomerShell from '@/components/CustomerShell';
import BackButton from '@/components/BackButton';
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

export default function MySupportCasesPage() {
  const router = useRouter();
  const [cases, setCases] = useState<SupportCaseRow[] | null>(null);

  useEffect(() => {
    apiFetch<SupportCaseRow[]>('/me/support/cases')
      .then(setCases)
      .catch(() => setCases([]));
  }, []);

  return (
    <CustomerShell>
      <header className="bingo-header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo%20para%20fondo%20osc.png" alt="BINGO+" className="bingo-logo-img" style={{ display: 'block', marginBottom: 10 }} />
        <BackButton onClick={() => router.push('/help')} light />
        <div className="bingo-header-sub">Mis casos de soporte</div>
      </header>

      <div className="bingo-content">
        {cases === null ? (
          <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
        ) : cases.length === 0 ? (
          <EmptyState title="No has enviado ningún caso" subtitle="Los casos que envíes por 'Soporte con la aplicación' aparecerán aquí." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
      </div>
    </CustomerShell>
  );
}
