'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import RiderShell from '@/components/RiderShell';
import EmptyState from '@/components/EmptyState';
import { apiFetch } from '@/lib/api';

interface SupportCaseResponse {
  id: string;
  message: string;
  evidenceUrl: string | null;
  createdAt: string;
}

interface SupportCaseDetail {
  id: string;
  code: string;
  subject: string;
  description: string;
  evidenceUrl: string | null;
  status: 'RECEIVED' | 'IN_PROGRESS' | 'CLOSED';
  createdAt: string;
  responses: SupportCaseResponse[];
}

const STATUS_LABELS: Record<string, string> = { RECEIVED: 'Recibido', IN_PROGRESS: 'En progreso', CLOSED: 'Cerrado' };

export default function MySupportCaseDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [supportCase, setSupportCase] = useState<SupportCaseDetail | null | undefined>(undefined);

  useEffect(() => {
    apiFetch<SupportCaseDetail>(`/me/support/cases/${params.id}`)
      .then(setSupportCase)
      .catch(() => setSupportCase(null));
  }, [params.id]);

  return (
    <RiderShell>
      <header className="bingo-header">
        <button className="bingo-button secondary small" style={{ marginBottom: 10 }} onClick={() => router.push('/help/cases')}>
          ← Mis casos
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo%20para%20fondo%20osc.png" alt="BINGO+" className="bingo-logo-img" />
        <div className="bingo-header-sub" style={{ marginTop: 4 }}>{supportCase ? supportCase.code : 'Caso de soporte'}</div>
      </header>

      <div className="bingo-content">
        {supportCase === undefined ? (
          <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
        ) : !supportCase ? (
          <EmptyState title="No encontramos este caso" />
        ) : (
          <>
            <div className="bingo-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{supportCase.subject}</div>
                <span className={`bingo-badge badge-${supportCase.status.toLowerCase()}`}>{STATUS_LABELS[supportCase.status]}</span>
              </div>
              <p style={{ fontSize: 13, marginTop: 10, whiteSpace: 'pre-wrap' }}>{supportCase.description}</p>
              {supportCase.evidenceUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={supportCase.evidenceUrl} alt="Evidencia" style={{ maxWidth: 220, borderRadius: 10, marginTop: 10 }} />
              )}
              <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 10 }}>
                {new Date(supportCase.createdAt).toLocaleString('es-EC')}
              </div>
            </div>

            <h2 className="bingo-section-title">Respuesta de soporte</h2>
            {supportCase.responses.length === 0 ? (
              <p style={{ fontSize: 13, color: '#7f8ea3' }}>
                Todavía no hay respuesta — te avisaremos cuando nuestro equipo revise tu caso.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {supportCase.responses.map((r) => (
                  <div key={r.id} className="bingo-card" style={{ background: '#f0fbf8' }}>
                    <p style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{r.message}</p>
                    {r.evidenceUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.evidenceUrl} alt="Evidencia" style={{ maxWidth: 200, borderRadius: 10, marginTop: 6 }} />
                    )}
                    <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 6 }}>
                      {new Date(r.createdAt).toLocaleString('es-EC')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </RiderShell>
  );
}
