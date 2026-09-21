'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { apiFetch, decodeRoles, getAccessToken, ApiError } from '@/lib/api';

type TemplateType = 'BUSINESS' | 'RIDER';

interface ContractTemplate {
  type: TemplateType;
  content: string;
}

const TEMPLATES: { type: TemplateType; title: string; placeholders: { token: string; hint: string }[] }[] = [
  {
    type: 'BUSINESS',
    title: 'Contrato de Negocio',
    placeholders: [{ token: '{{tarifas_comisiones}}', hint: 'comisión y membresía vigentes de ese negocio' }],
  },
  {
    type: 'RIDER',
    title: 'Contrato de Rider',
    placeholders: [
      { token: '{{comision_bingo}}', hint: '% de comisión vigente' },
      { token: '{{retencion_impuesto}}', hint: '% de retención de impuesto vigente' },
    ],
  },
];

function TemplateCard({ type, title, placeholders }: (typeof TEMPLATES)[number]) {
  const [content, setContent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<ContractTemplate>(`/admin/settings/contract-templates/${type}`)
      .then((t) => setContent(t.content))
      .catch(() => setContent(''));
  }, [type]);

  async function save() {
    if (content === null) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const saved = await apiFetch<ContractTemplate>(`/admin/settings/contract-templates/${type}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      });
      setContent(saved.content);
      setMsg('Plantilla actualizada — se usará para todas las nuevas solicitudes aprobadas de aquí en adelante.');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bingo-card" style={{ marginBottom: 16 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 8px' }}>{title}</h2>
      <p style={{ fontSize: 12, color: '#7f8ea3', margin: '0 0 10px' }}>
        Se usa para generar el contrato de cada nueva solicitud aprobada. Editarla no cambia los contratos ya generados o
        firmados — esos quedan congelados con el texto que tenían en su momento. Marcadores disponibles:{' '}
        {placeholders.map((p, i) => (
          <span key={p.token}>
            {i > 0 && ', '}
            <code style={{ background: '#f1f3f6', padding: '1px 5px', borderRadius: 4 }}>{p.token}</code> ({p.hint})
          </span>
        ))}
        .
      </p>
      {err && <div style={{ color: 'var(--bingo-error)', fontSize: 13, marginBottom: 8 }}>{err}</div>}
      {msg && <div style={{ color: 'var(--bingo-success, #1a8a4c)', fontSize: 13, marginBottom: 8 }}>{msg}</div>}
      {content === null ? (
        <p style={{ fontSize: 13 }}>Cargando…</p>
      ) : (
        <>
          <textarea
            className="bingo-input"
            style={{ width: '100%', minHeight: 320, fontFamily: 'monospace', fontSize: 12.5, lineHeight: 1.6, resize: 'vertical' }}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <button className="bingo-button" style={{ width: 'auto', marginTop: 10 }} disabled={busy} onClick={save}>
            {busy ? 'Guardando…' : 'Guardar plantilla'}
          </button>
        </>
      )}
    </div>
  );
}

export default function ContractTemplatesPage() {
  // Defense in depth only — the backend's RolesGuard is the real gate (AdminSettingsController
  // never grants RoleName.USER). AdminShell's nav already hides the link for that role.
  const [restricted, setRestricted] = useState(false);

  useEffect(() => {
    const token = getAccessToken();
    const roles = token ? decodeRoles(token) : [];
    setRestricted(roles.includes('USER') && !roles.includes('ADMIN') && !roles.includes('SUPER_ADMIN'));
  }, []);

  if (restricted) {
    return (
      <AdminShell>
        <h1 className="bingo-page-title">Contratos</h1>
        <div className="bingo-card" style={{ color: 'var(--bingo-error)' }}>Tu cuenta no tiene acceso a esta sección.</div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <h1 className="bingo-page-title" style={{ marginBottom: 24 }}>Contratos</h1>
      {TEMPLATES.map((t) => (
        <TemplateCard key={t.type} {...t} />
      ))}
    </AdminShell>
  );
}
