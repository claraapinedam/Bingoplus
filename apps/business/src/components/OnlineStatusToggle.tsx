'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api';
import { BusinessProfile, setBusinessOnlineOverride } from '@/lib/business';

/**
 * The business's own connect/disconnect toggle — mirrors the Rider App's own availability toggle
 * (apps/rider/src/app/page.tsx's toggleAvailability), but this one has an automatic half: absent a
 * manual override, `business.onlineStatus` already follows the business's configured opening hours
 * (computed server-side by getBusinessOnlineStatus in @bingoplus/utils — see the schema comment on
 * Business.manualOverride for why an override persists until changed rather than auto-expiring).
 *
 * Rendered once from DashboardShell (like NewOrderAlerts) so it's visible on every page of the
 * dashboard, not just one screen — the business should always be able to see and flip this.
 */
export default function OnlineStatusToggle({ business, onChanged }: { business: BusinessProfile; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { online, source, isOpenNow, closesAt } = business.onlineStatus;

  async function setOverride(override: 'ONLINE' | 'OFFLINE' | null) {
    setBusy(true);
    setError(null);
    try {
      await setBusinessOnlineOverride(business.id, override);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar el estado del negocio.');
    } finally {
      setBusy(false);
    }
  }

  let scheduleHint: string;
  if (isOpenNow === null) {
    scheduleHint = 'Horario: no configurado';
  } else if (isOpenNow) {
    scheduleHint = closesAt ? `Horario: abierto hasta las ${closesAt}` : 'Horario: abierto ahora';
  } else {
    scheduleHint = 'Horario: cerrado ahora';
  }

  return (
    <div className="bingo-card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: online ? 'var(--bingo-success)' : 'var(--bingo-error)' }}>
            {online ? '🟢 Conectado' : '🔴 Desconectado'}
          </span>
          <span className="bingo-badge" style={{ background: '#f2f4f7', color: 'var(--bingo-navy)' }}>
            {source === 'MANUAL' ? 'Manual' : 'Automático'}
          </span>
        </div>
        <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 4 }}>{scheduleHint}</div>
        {error && <div style={{ fontSize: 12, color: 'var(--bingo-error)', marginTop: 4 }}>{error}</div>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {source === 'MANUAL' && (
          <button
            className="bingo-button secondary small"
            style={{ width: 'auto' }}
            disabled={busy}
            onClick={() => setOverride(null)}
          >
            Volver a automático
          </button>
        )}
        <button
          className="bingo-button small"
          style={{ width: 'auto' }}
          disabled={busy}
          onClick={() => setOverride(online ? 'OFFLINE' : 'ONLINE')}
        >
          {busy ? '...' : online ? 'Desconectar negocio' : 'Conectar negocio'}
        </button>
      </div>
    </div>
  );
}
