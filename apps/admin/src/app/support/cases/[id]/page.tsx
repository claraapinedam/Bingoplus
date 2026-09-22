'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import AdminShell from '@/components/AdminShell';
import ImageUploadField from '@/components/ImageUploadField';
import { apiFetch, ApiError } from '@/lib/api';

interface SupportCaseResponse {
  id: string;
  message: string;
  evidenceUrl: string | null;
  createdAt: string;
  author: { firstName: string; lastName: string };
}

interface SupportCaseDetail {
  id: string;
  code: string;
  submitterType: 'CUSTOMER' | 'BUSINESS' | 'RIDER';
  subject: string;
  description: string;
  evidenceUrl: string | null;
  status: 'RECEIVED' | 'IN_PROGRESS' | 'CLOSED';
  createdAt: string;
  submitter: { firstName: string; lastName: string; email: string };
  business: { tradeName: string } | null;
  responses: SupportCaseResponse[];
}

const STATUS_LABELS: Record<string, string> = { RECEIVED: 'Recibido', IN_PROGRESS: 'En progreso', CLOSED: 'Cerrado' };
const SUBMITTER_LABELS: Record<string, string> = { CUSTOMER: 'Cliente', BUSINESS: 'Negocio', RIDER: 'Rider' };

export default function SupportCaseDetailPage() {
  const params = useParams<{ id: string }>();
  const [supportCase, setSupportCase] = useState<SupportCaseDetail | null | undefined>(undefined);
  const [message, setMessage] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch<SupportCaseDetail>(`/admin/support/cases/${params.id}`).then(setSupportCase).catch(() => setSupportCase(null));
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function respond(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    setError(null);
    try {
      await apiFetch(`/admin/support/cases/${params.id}/responses`, {
        method: 'POST',
        body: JSON.stringify({ message, evidenceUrl: evidenceUrl || undefined }),
      });
      setMessage('');
      setEvidenceUrl('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar la respuesta.');
    } finally {
      setSending(false);
    }
  }

  async function setStatus(status: string) {
    setError(null);
    try {
      await apiFetch(`/admin/support/cases/${params.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado.');
    }
  }

  if (supportCase === undefined) {
    return (
      <AdminShell>
        <p>Cargando…</p>
      </AdminShell>
    );
  }
  if (!supportCase) {
    return (
      <AdminShell>
        <div className="bingo-card" style={{ color: 'var(--bingo-error)' }}>No encontramos este caso.</div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <h1 className="bingo-page-title" style={{ marginBottom: 4 }}>{supportCase.code}</h1>
      <p className="bingo-page-subtitle" style={{ marginTop: 0, marginBottom: 20 }}>
        {SUBMITTER_LABELS[supportCase.submitterType]} · {supportCase.submitter.firstName} {supportCase.submitter.lastName} ({supportCase.submitter.email})
        {supportCase.business && ` · ${supportCase.business.tradeName}`}
      </p>

      {error && <div className="bingo-card" style={{ marginBottom: 16, color: 'var(--bingo-error)' }}>{error}</div>}

      <div className="bingo-card" style={{ marginBottom: 16, maxWidth: 720 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{supportCase.subject}</div>
          <span className={`bingo-badge badge-${supportCase.status.toLowerCase()}`}>{STATUS_LABELS[supportCase.status]}</span>
        </div>
        <p style={{ fontSize: 14, marginTop: 10, whiteSpace: 'pre-wrap' }}>{supportCase.description}</p>
        {supportCase.evidenceUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={supportCase.evidenceUrl} alt="Evidencia" style={{ maxWidth: 240, borderRadius: 10, marginTop: 10 }} />
        )}
        <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 10 }}>
          {new Date(supportCase.createdAt).toLocaleString('es-EC')}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['RECEIVED', 'IN_PROGRESS', 'CLOSED'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`bingo-button ${supportCase.status === s ? '' : 'secondary'}`}
            style={{ width: 'auto', padding: '8px 14px', fontSize: 13 }}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>Respuestas</h2>
      <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {supportCase.responses.length === 0 && <p style={{ fontSize: 13, color: '#7f8ea3' }}>Aún no hay respuestas.</p>}
        {supportCase.responses.map((r) => (
          <div key={r.id} className="bingo-card">
            <div style={{ fontWeight: 700, fontSize: 13 }}>
              {r.author.firstName} {r.author.lastName}
              <span style={{ fontWeight: 400, color: '#7f8ea3', marginLeft: 8, fontSize: 12 }}>
                {new Date(r.createdAt).toLocaleString('es-EC')}
              </span>
            </div>
            <p style={{ fontSize: 13, marginTop: 6, whiteSpace: 'pre-wrap' }}>{r.message}</p>
            {r.evidenceUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.evidenceUrl} alt="Evidencia" style={{ maxWidth: 200, borderRadius: 10, marginTop: 6 }} />
            )}
          </div>
        ))}
      </div>

      <form onSubmit={respond} className="bingo-card" style={{ maxWidth: 720 }}>
        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Responder</label>
        <textarea
          className="bingo-input"
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Escribe tu respuesta…"
          required
        />
        <div style={{ marginTop: 10 }}>
          <ImageUploadField
            label="Evidencia (opcional)"
            value={evidenceUrl}
            onChange={setEvidenceUrl}
            onUploadingChange={setUploadingEvidence}
          />
        </div>
        <button
          className="bingo-button"
          style={{ marginTop: 12, width: 'auto', padding: '0 20px' }}
          disabled={sending || uploadingEvidence}
          type="submit"
        >
          {uploadingEvidence ? 'Esperando la imagen…' : sending ? 'Enviando…' : 'Enviar respuesta'}
        </button>
      </form>
    </AdminShell>
  );
}
