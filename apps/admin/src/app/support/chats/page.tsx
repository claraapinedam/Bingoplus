'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { apiFetch, ApiError } from '@/lib/api';

interface SupportChat {
  id: string;
  relatedType: 'ORDER' | 'DELIVERY' | 'BOOKING';
  relatedId: string;
  status: 'OPEN' | 'CLOSED';
  ratingScore: number | null;
  createdAt: string;
  submitter: { firstName: string; lastName: string; email: string };
  business: { tradeName: string } | null;
  assignedAdmin: { firstName: string; lastName: string } | null;
}

// Split by submitter type into separate tabs, per spec — Clientes / Negocios / Riders.
const SUBMITTER_TABS = [
  { value: 'CUSTOMER', label: 'Clientes' },
  { value: 'BUSINESS', label: 'Negocios' },
  { value: 'RIDER', label: 'Riders' },
] as const;

const RELATED_LABELS: Record<string, string> = { ORDER: 'Pedido', DELIVERY: 'Entrega', BOOKING: 'Reserva' };

export default function SupportChatsPage() {
  const [submitterType, setSubmitterType] = useState<(typeof SUBMITTER_TABS)[number]['value']>('CUSTOMER');
  const [chats, setChats] = useState<SupportChat[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await apiFetch<SupportChat[]>(`/admin/support/chats?submitterType=${submitterType}`);
      setChats(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar los chats.');
    }
  }, [submitterType]);

  useEffect(() => {
    load();
    // Simple refresh cadence so a newly-opened chat from Customer/Business/Rider shows up without
    // a manual reload — same short-poll idea as the chat screen itself, just at a slower pace
    // since this is a list, not an active conversation.
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <AdminShell>
      <h1 className="bingo-page-title" style={{ marginBottom: 4 }}>Soporte en pedidos</h1>
      <p className="bingo-page-subtitle" style={{ marginTop: 0, marginBottom: 16 }}>
        Chats en vivo iniciados desde "Soporte con un pedido", separados por quién los envió.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {SUBMITTER_TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setSubmitterType(t.value)}
            className={`bingo-button ${submitterType === t.value ? '' : 'secondary'}`}
            style={{ width: 'auto', padding: '8px 16px', fontSize: 13 }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="bingo-card" style={{ marginBottom: 16, color: 'var(--bingo-error)' }}>{error}</div>}

      <div className="bingo-card">
        {chats === null ? (
          <p>Cargando…</p>
        ) : chats.length === 0 ? (
          <p>No hay chats en esta categoría.</p>
        ) : (
          <table className="bingo-table">
            <thead>
              <tr>
                <th>Enviado por</th>
                <th>Sobre</th>
                <th>Estado</th>
                <th>Agente</th>
                <th>Calificación</th>
                <th>Fecha</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {chats.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.submitter.firstName} {c.submitter.lastName}
                    {c.business && <div style={{ fontSize: 11, color: '#7f8ea3' }}>{c.business.tradeName}</div>}
                  </td>
                  <td>{RELATED_LABELS[c.relatedType]}</td>
                  <td>
                    <span className={`bingo-badge ${c.status === 'OPEN' ? 'badge-received' : 'badge-closed'}`}>
                      {c.status === 'OPEN' ? 'Abierto' : 'Cerrado'}
                    </span>
                  </td>
                  <td>{c.assignedAdmin ? `${c.assignedAdmin.firstName} ${c.assignedAdmin.lastName}` : '—'}</td>
                  <td>{c.ratingScore != null ? `⭐ ${c.ratingScore}` : '—'}</td>
                  <td>{new Date(c.createdAt).toLocaleDateString('es-EC', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td>
                    <a href={`/support/chats/${c.id}`} className="bingo-button secondary" style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }}>
                      Abrir
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
