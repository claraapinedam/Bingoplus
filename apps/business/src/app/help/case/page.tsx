'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';
import ImageUploadField from '@/components/ImageUploadField';
import { apiFetch, ApiError, getActiveBusinessId } from '@/lib/api';

interface SupportCase {
  id: string;
  code: string;
}

function CaseFormContent() {
  const router = useRouter();
  const businessId = getActiveBusinessId();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<SupportCase | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<SupportCase>('/me/support/cases', {
        method: 'POST',
        body: JSON.stringify({ submitterType: 'BUSINESS', businessId, subject, description, evidenceUrl: evidenceUrl || undefined }),
      });
      setCreated(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar tu caso. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <>
        <button className="bingo-button secondary small" style={{ marginBottom: 16, width: 'auto' }} onClick={() => router.push('/help')}>
          ← Ayuda
        </button>
        <header className="dashboard-page-header">
          <div className="dashboard-page-title">Caso enviado</div>
        </header>
        <div className="bingo-card" style={{ maxWidth: 480, textAlign: 'center' }}>
          <div style={{ fontSize: 32 }}>✅</div>
          <div style={{ fontWeight: 800, fontSize: 16, marginTop: 8 }}>¡Listo! Recibimos tu caso</div>
          <div style={{ fontSize: 13, color: '#54617a', marginTop: 6 }}>
            Tu número de caso es <strong>{created.code}</strong>. Nuestro equipo lo revisará pronto.
          </div>
          <button className="bingo-button" style={{ marginTop: 16 }} onClick={() => router.push('/help')}>
            Volver a Ayuda
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <button className="bingo-button secondary small" style={{ marginBottom: 16, width: 'auto' }} onClick={() => router.push('/help')}>
        ← Ayuda
      </button>
      <header className="dashboard-page-header">
        <div className="dashboard-page-title">Soporte con la aplicación</div>
      </header>
      <form onSubmit={submit} style={{ maxWidth: 480 }}>
        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Asunto</label>
        <input
          className="bingo-input"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Ej. No veo mis pedidos nuevos"
          required
          minLength={3}
          maxLength={150}
        />

        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', margin: '14px 0 4px' }}>Descripción</label>
        <textarea
          className="bingo-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Cuéntanos qué pasó con el mayor detalle posible"
          rows={5}
          required
          minLength={5}
          maxLength={4000}
        />

        <div style={{ marginTop: 14 }}>
          <ImageUploadField label="Evidencia (opcional)" value={evidenceUrl} onChange={setEvidenceUrl} />
        </div>

        {error && <div className="bingo-error-banner" style={{ marginTop: 14 }}>{error}</div>}

        <button className="bingo-button" style={{ marginTop: 18, width: 'auto', padding: '0 20px' }} disabled={busy} type="submit">
          {busy ? 'Enviando…' : 'Enviar caso'}
        </button>
      </form>
    </>
  );
}

export default function SupportCaseFormPage() {
  return (
    <DashboardShell>
      <CaseFormContent />
    </DashboardShell>
  );
}
