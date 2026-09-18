'use client';

import { useState } from 'react';

export interface DateRangeFilterValue {
  preset?: string;
  /** "YYYY-MM-DD" for a whole-day bound, or "YYYY-MM-DDTHH:mm" for an exact hour. */
  from?: string;
  to?: string;
}

const BASE_PRESETS = [
  { value: 'today', label: 'Hoy' },
  { value: 'last_7_days', label: 'Últimos 7 días' },
  { value: 'last_30_days', label: 'Últimos 30 días' },
  { value: 'this_month', label: 'Este mes' },
  { value: 'last_month', label: 'Mes anterior' },
];

/**
 * One date-range control shared by every admin screen that filters by period (Inicio, Analíticas,
 * Delivery) — presets plus a "Personalizado" toggle exposing two datetime-local inputs. Using
 * datetime-local (not plain date) for both fields covers both shapes the request called for: pick
 * one day and narrow it to an hour range (same date, different times), or a plain multi-day
 * from/to range (different dates, times left at the day's natural start/end).
 */
export default function DateRangeFilter({
  value,
  onChange,
  /** Shows a "Todo" chip that clears the filter entirely — only meaningful for operational list
   * views (Delivery, Inicio) whose backend treats an absent from/to as "no bound". Analíticas
   * always resolves to *some* period (resolveDateRange's own default), so it omits this. */
  allowAll = false,
}: {
  value: DateRangeFilterValue;
  onChange: (value: DateRangeFilterValue) => void;
  allowAll?: boolean;
}) {
  const [customOpen, setCustomOpen] = useState(Boolean(value.from || value.to));
  const presets = allowAll ? [{ value: '', label: 'Todo' }, ...BASE_PRESETS] : BASE_PRESETS;

  function selectPreset(preset: string) {
    setCustomOpen(false);
    onChange({ preset: preset || undefined, from: undefined, to: undefined });
  }

  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
      {presets.map((p) => (
        <button
          key={p.value}
          onClick={() => selectPreset(p.value)}
          className={`bingo-button ${!customOpen && (value.preset ?? '') === p.value ? '' : 'secondary'}`}
          style={{ padding: '8px 14px', fontSize: 13 }}
        >
          {p.label}
        </button>
      ))}
      <button
        onClick={() => setCustomOpen((o) => !o)}
        className={`bingo-button ${customOpen ? '' : 'secondary'}`}
        style={{ padding: '8px 14px', fontSize: 13 }}
      >
        Personalizado
      </button>
      {customOpen && (
        <>
          <input
            type="datetime-local"
            className="bingo-input"
            style={{ width: 'auto' }}
            value={value.from ?? ''}
            onChange={(e) => onChange({ preset: 'custom', from: e.target.value, to: value.to })}
          />
          <span style={{ color: '#9aa5b1' }}>—</span>
          <input
            type="datetime-local"
            className="bingo-input"
            style={{ width: 'auto' }}
            value={value.to ?? ''}
            onChange={(e) => onChange({ preset: 'custom', from: value.from, to: e.target.value })}
          />
        </>
      )}
    </div>
  );
}
