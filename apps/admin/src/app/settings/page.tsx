'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { apiFetch, decodeRoles, getAccessToken, ApiError } from '@/lib/api';

interface RankingWeights {
  speciesMatch: number;
  distance: number;
  availability: number;
  rating: number;
  delivery: number;
}

interface PricingConfig {
  platformFeePercent: number;
  serviceFeePercent: number;
  serviceFeeFixed: number;
  defaultTaxPercent: number;
  defaultDeliveryFee: number;
}

const WEIGHT_LABELS: { key: keyof RankingWeights; label: string }[] = [
  { key: 'speciesMatch', label: 'Coincidencia de especie' },
  { key: 'distance', label: 'Distancia' },
  { key: 'availability', label: 'Disponibilidad' },
  { key: 'rating', label: 'Calificación' },
  { key: 'delivery', label: 'Delivery' },
];

const PRICING_LABELS: { key: keyof PricingConfig; label: string; hint: string }[] = [
  { key: 'platformFeePercent', label: 'Comisión de plataforma', hint: 'ej. 0.05 = 5%' },
  { key: 'serviceFeePercent', label: 'Cargo por servicio (%)', hint: 'ej. 0.03 = 3%' },
  { key: 'serviceFeeFixed', label: 'Cargo por servicio (fijo, USD)', hint: 'monto fijo en dólares' },
  { key: 'defaultTaxPercent', label: 'Impuesto por defecto', hint: 'ej. 0.12 = 12%' },
  { key: 'defaultDeliveryFee', label: 'Tarifa de delivery por defecto (USD)', hint: 'usada si el negocio no define la suya' },
];

// Number inputs bound directly to a number state fight the user over leading/trailing
// characters while typing (e.g. clearing the "0" before typing "1" leaves "01" on screen,
// since the DOM's raw text and React's coerced-back-to-number value fall out of sync mid-edit).
// Editing as free text and only parsing to a number on blur/save avoids that entirely.
function NumberField({
  value,
  onChange,
  min,
  max,
  step,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: string;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  return (
    <input
      className="bingo-input"
      type="number"
      min={min}
      max={max}
      step={step}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        if (e.target.value !== '' && e.target.value !== '-') {
          const parsed = Number(e.target.value);
          if (!Number.isNaN(parsed)) onChange(parsed);
        }
      }}
      onBlur={() => {
        if (text === '' || text === '-' || Number.isNaN(Number(text))) {
          setText(String(value));
        }
      }}
    />
  );
}

export default function AdminSettingsPage() {
  const [weights, setWeights] = useState<RankingWeights | null>(null);
  const [pricing, setPricing] = useState<PricingConfig | null>(null);
  const [weightsBusy, setWeightsBusy] = useState(false);
  const [pricingBusy, setPricingBusy] = useState(false);
  const [weightsMsg, setWeightsMsg] = useState<string | null>(null);
  const [pricingMsg, setPricingMsg] = useState<string | null>(null);
  const [weightsErr, setWeightsErr] = useState<string | null>(null);
  const [pricingErr, setPricingErr] = useState<string | null>(null);
  // Defense in depth only — the backend's RolesGuard is the real gate (AdminSettingsController
  // never grants RoleName.USER). AdminShell's nav already hides the link for that role.
  const [restricted, setRestricted] = useState(false);

  useEffect(() => {
    const token = getAccessToken();
    const roles = token ? decodeRoles(token) : [];
    const isRestricted = roles.includes('USER') && !roles.includes('ADMIN') && !roles.includes('SUPER_ADMIN');
    setRestricted(isRestricted);
    if (isRestricted) return;
    apiFetch<RankingWeights>('/admin/settings/ranking-weights').then(setWeights).catch(() => setWeights(null));
    apiFetch<PricingConfig>('/admin/settings/pricing').then(setPricing).catch(() => setPricing(null));
  }, []);

  if (restricted) {
    return (
      <AdminShell>
        <h1 className="bingo-page-title">Variables</h1>
        <div className="bingo-card" style={{ color: 'var(--bingo-error)' }}>Tu cuenta no tiene acceso a esta sección.</div>
      </AdminShell>
    );
  }

  const weightSum = weights ? WEIGHT_LABELS.reduce((sum, w) => sum + (weights[w.key] || 0), 0) : 0;
  const weightSumValid = Math.abs(weightSum - 1) <= 0.001;

  async function saveWeights() {
    if (!weights || !weightSumValid) return;
    setWeightsBusy(true);
    setWeightsErr(null);
    setWeightsMsg(null);
    try {
      const saved = await apiFetch<RankingWeights>('/admin/settings/ranking-weights', {
        method: 'PATCH',
        body: JSON.stringify(weights),
      });
      setWeights(saved);
      setWeightsMsg('Pesos de ranking actualizados.');
    } catch (err) {
      setWeightsErr(err instanceof ApiError ? err.message : 'No se pudo guardar.');
    } finally {
      setWeightsBusy(false);
    }
  }

  async function savePricing() {
    if (!pricing) return;
    setPricingBusy(true);
    setPricingErr(null);
    setPricingMsg(null);
    try {
      const saved = await apiFetch<PricingConfig>('/admin/settings/pricing', {
        method: 'PATCH',
        body: JSON.stringify(pricing),
      });
      setPricing(saved);
      setPricingMsg('Configuración de precios actualizada.');
    } catch (err) {
      setPricingErr(err instanceof ApiError ? err.message : 'No se pudo guardar.');
    } finally {
      setPricingBusy(false);
    }
  }

  return (
    <AdminShell>
      <h1 className="bingo-page-title">Variables</h1>
      <p className="bingo-page-subtitle">
        Pesos de ranking del marketplace y comisiones/tarifas de la plataforma. Cada cambio queda registrado en Auditoría.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="bingo-card">
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px' }}>Pesos de ranking</h2>
          <p style={{ fontSize: 12, color: '#7f8ea3', margin: '0 0 12px' }}>Deben sumar exactamente 1.</p>

          {weights === null ? (
            <p>Cargando…</p>
          ) : (
            <>
              {WEIGHT_LABELS.map((w) => (
                <div key={w.key} style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>{w.label}</label>
                  <NumberField
                    min={0}
                    max={1}
                    step="0.01"
                    value={weights[w.key]}
                    onChange={(value) => setWeights({ ...weights, [w.key]: value })}
                  />
                </div>
              ))}

              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: weightSumValid ? 'var(--bingo-success)' : 'var(--bingo-error)' }}>
                Suma actual: {weightSum.toFixed(3)} {weightSumValid ? '✓' : '(debe ser 1.000)'}
              </div>

              {weightsErr && <div style={{ color: 'var(--bingo-error)', fontSize: 13, marginBottom: 10 }}>{weightsErr}</div>}
              {weightsMsg && <div style={{ color: 'var(--bingo-success)', fontSize: 13, marginBottom: 10 }}>{weightsMsg}</div>}

              <button className="bingo-button" disabled={weightsBusy || !weightSumValid} onClick={saveWeights}>
                {weightsBusy ? 'Guardando…' : 'Guardar pesos'}
              </button>
            </>
          )}
        </div>

        <div className="bingo-card">
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px' }}>Precios y comisiones</h2>
          <p style={{ fontSize: 12, color: '#7f8ea3', margin: '0 0 12px' }}>
            Afecta el cálculo de checkout (PriceCalculationService) desde el próximo pedido.
          </p>

          {pricing === null ? (
            <p>Cargando…</p>
          ) : (
            <>
              {PRICING_LABELS.map((p) => (
                <div key={p.key} style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                    {p.label} <span style={{ fontWeight: 400, color: '#9aa5b1' }}>({p.hint})</span>
                  </label>
                  <NumberField
                    min={0}
                    step="0.01"
                    value={pricing[p.key]}
                    onChange={(value) => setPricing({ ...pricing, [p.key]: value })}
                  />
                </div>
              ))}

              {pricingErr && <div style={{ color: 'var(--bingo-error)', fontSize: 13, marginBottom: 10 }}>{pricingErr}</div>}
              {pricingMsg && <div style={{ color: 'var(--bingo-success)', fontSize: 13, marginBottom: 10 }}>{pricingMsg}</div>}

              <button className="bingo-button" disabled={pricingBusy} onClick={savePricing}>
                {pricingBusy ? 'Guardando…' : 'Guardar precios'}
              </button>
            </>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
