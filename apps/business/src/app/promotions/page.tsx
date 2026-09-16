'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';
import EmptyState from '@/components/EmptyState';
import { apiFetch, ApiError, getActiveBusinessId } from '@/lib/api';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  ACTIVE: 'Activa',
  PAUSED: 'Pausada',
  EXPIRED: 'Expirada',
  CANCELLED: 'Cancelada',
};

interface PromotionRow {
  id: string;
  name: string;
  type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  value: string | number;
  status: string;
  startDate: string;
  endDate: string;
  targets: { targetType: string }[];
}

function PromotionsContent() {
  const router = useRouter();
  const businessId = getActiveBusinessId();
  const [promotions, setPromotions] = useState<PromotionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!businessId) return;
    apiFetch<PromotionRow[]>(`/business/${businessId}/promotions`).then(setPromotions).catch(() => setPromotions([]));
  }, [businessId]);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(id: string, action: 'activate' | 'pause' | 'cancel') {
    if (!businessId) return;
    setBusy(id);
    setError(null);
    try {
      await apiFetch(`/business/${businessId}/promotions/${id}/${action}`, { method: 'PATCH', body: JSON.stringify({}) });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'La acción falló.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <header className="dashboard-page-header">
        <div className="dashboard-page-title">Promociones</div>
        <button className="bingo-button" style={{ width: 'auto' }} onClick={() => router.push('/promotions/new')}>
          + Nueva promoción
        </button>
      </header>

      {error && <div className="bingo-error-banner" style={{ marginBottom: 14, maxWidth: 640 }}>{error}</div>}

      {promotions === null ? (
        <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
      ) : promotions.length === 0 ? (
        <EmptyState title="No tienes promociones" subtitle="Crea una promoción para que tus clientes vean descuentos automáticos, sin necesidad de un código." />
      ) : (
        <div className="dashboard-table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Aplica a</th>
                <th>Descuento</th>
                <th>Vigencia</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {promotions.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 700 }}>{p.name}</td>
                  <td>{p.targets.map((t) => t.targetType).join(', ')}</td>
                  <td>{p.type === 'PERCENTAGE' ? `${p.value}%` : currencyFormatter.format(Number(p.value))}</td>
                  <td style={{ fontSize: 12 }}>
                    {new Date(p.startDate).toLocaleDateString('es-EC')} – {new Date(p.endDate).toLocaleDateString('es-EC')}
                  </td>
                  <td>
                    <span className="bingo-badge" style={{ background: '#f2f4f7' }}>{STATUS_LABELS[p.status] ?? p.status}</span>
                  </td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    {(p.status === 'DRAFT' || p.status === 'PAUSED') && (
                      <button className="bingo-button secondary small" style={{ width: 'auto' }} disabled={busy === p.id} onClick={() => runAction(p.id, 'activate')}>
                        Activar
                      </button>
                    )}
                    {p.status === 'ACTIVE' && (
                      <button className="bingo-button secondary small" style={{ width: 'auto' }} disabled={busy === p.id} onClick={() => runAction(p.id, 'pause')}>
                        Pausar
                      </button>
                    )}
                    {p.status !== 'CANCELLED' && p.status !== 'EXPIRED' && (
                      <button className="bingo-button secondary small" style={{ width: 'auto', color: 'var(--bingo-error)' }} disabled={busy === p.id} onClick={() => runAction(p.id, 'cancel')}>
                        Cancelar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function PromotionsPage() {
  return (
    <DashboardShell>
      <PromotionsContent />
    </DashboardShell>
  );
}
