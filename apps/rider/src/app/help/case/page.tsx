'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import RiderShell from '@/components/RiderShell';
import ImageUploadField from '@/components/ImageUploadField';
import { apiFetch, ApiError } from '@/lib/api';

interface SupportCase {
  id: string;
  code: string;
}

export default function SupportCaseFormPage() {
  const router = useRouter();
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
        body: JSON.stringify({ submitterType: 'RIDER', subject, description, evidenceUrl: evidenceUrl || undefined }),
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
      <RiderShell>
        <header className="bingo-header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo%20para%20fondo%20osc.png" alt="BINGO+" className="bingo-logo-img" />
          <div className="bingo-header-sub" style={{ marginTop: 4 }}>Caso enviado</div>
        </header>
        <div className="bingo-content">
          <div className="bingo-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32 }}>✅</div>
            <div style={{ fontWeight: 800, fontSize: 16, marginTop: 8 }}>¡Listo! Recibimos tu caso</div>
            <div style={{ fontSize: 13, color: '#7f8ea3', marginTop: 6 }}>
              Tu número de caso es <strong>{created.code}</strong>. Nuestro equipo lo revisará pronto.
            </div>
            <button className="bingo-button" style={{ marginTop: 16 }} onClick={() => router.push('/help')}>
              Volver a Ayuda
            </button>
          </div>
        </div>
      </RiderShell>
    );
  }

  return (
    <RiderShell>
      <header className="bingo-header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo%20para%20fondo%20osc.png" alt="BINGO+" className="bingo-logo-img" />
        <div className="bingo-header-sub" style={{ marginTop: 4 }}>Soporte con la aplicación</div>
      </header>

      <form className="bingo-content" onSubmit={submit}>
        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Asunto</label>
        <input
          className="bingo-input"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Ej. No me llegan ofertas de entrega"
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

        <button className="bingo-button" style={{ marginTop: 18 }} disabled={busy} type="submit">
          {busy ? 'Enviando…' : 'Enviar caso'}
        </button>
      </form>
    </RiderShell>
  );
}
