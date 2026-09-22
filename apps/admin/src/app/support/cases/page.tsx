'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { apiFetch, ApiError } from '@/lib/api';

interface SupportCase {
  id: string;
  code: string;
  submitterType: 'CUSTOMER' | 'BUSINESS' | 'RIDER';
  subject: string;
  status: 'RECEIVED' | 'IN_PROGRESS' | 'CLOSED';
  createdAt: string;
  submitter: { firstName: string; lastName: string; email: string };
  business: { tradeName: string } | null;
}

const STATUS_TABS = [
  { value: '', label: 'Todos' },
  { value: 'RECEIVED', label: 'Recibido' },
  { value: 'IN_PROGRESS', label: 'En progreso' },
  { value: 'CLOSED', label: 'Cerrado' },
];

const STATUS_LABELS: Record<string, string> = { RECEIVED: 'Recibido', IN_PROGRESS: 'En progreso', CLOSED: 'Cerrado' };
const SUBMITTER_LABELS: Record<string, string> = { CUSTOMER: 'Cliente', BUSINESS: 'Negocio', RIDER: 'Rider' };

export default function SupportCasesPage() {
  const [status, setStatus] = useState('');
  const [cases, setCases] = useState<SupportCase[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await apiFetch<SupportCase[]>(`/admin/support/cases${status ? `?status=${status}` : ''}`);
      setCases(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar los casos.');
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AdminShell>
      <h1 className="bingo-page-title" style={{ marginBottom: 24 }}>Soporte técnico</h1>
      <p className="bingo-page-subtitle" style={{ marginTop: -16, marginBottom: 16 }}>
        Casos de &quot;Soporte con la aplicación&quot; enviados desde Cliente, Negocio y Rider.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {STATUS_TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setStatus(t.value)}
            className={`bingo-button ${status === t.value ? '' : 'secondary'}`}
            style={{ padding: '8px 14px', fontSize: 13, width: 'auto' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="bingo-card" style={{ marginBottom: 16, color: 'var(--bingo-error)' }}>{error}</div>}

      <div className="bingo-card">
        {cases === null ? (
          <p>Cargando…</p>
        ) : cases.length === 0 ? (
          <p>No hay casos en este filtro.</p>
        ) : (
          <table className="bingo-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Origen</th>
                <th>Enviado por</th>
                <th>Asunto</th>
                <th>Estado</th>
                <th>Fecha</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 700 }}>{c.code}</td>
                  <td>{SUBMITTER_LABELS[c.submitterType]}</td>
                  <td>
                    {c.submitter.firstName} {c.submitter.lastName}
                    {c.business && <div style={{ fontSize: 11, color: '#7f8ea3' }}>{c.business.tradeName}</div>}
                  </td>
                  <td>{c.subject}</td>
                  <td>
                    <span className={`bingo-badge badge-${c.status.toLowerCase()}`}>{STATUS_LABELS[c.status]}</span>
                  </td>
                  <td>{new Date(c.createdAt).toLocaleDateString('es-EC', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td>
                    <a href={`/support/cases/${c.id}`} className="bingo-button secondary" style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }}>
                      Ver
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminShell>
  );
}
