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

/** Customer-facing checkout charges only — the business's own commission and delivery fare are
 * separate config objects below, never part of this one. */
interface PricingConfig {
  serviceFeePercent: number;
  serviceFeeFixed: number;
  defaultTaxPercent: number;
}

interface DeliveryFareConfig {
  minFareDay: number;
  minFareNight: number;
  nightStartHour: number;
  nightEndHour: number;
  perKmRate: number;
  perMinuteRate: number;
  surgeThreshold: number;
  surgeMultiplier: number;
  bingoCommissionPercent: number;
  riderTaxWithholdingPercent: number;
}

const WEIGHT_LABELS: { key: keyof RankingWeights; label: string }[] = [
  { key: 'speciesMatch', label: 'Coincidencia de especie' },
  { key: 'distance', label: 'Distancia' },
  { key: 'availability', label: 'Disponibilidad' },
  { key: 'rating', label: 'Calificación' },
  { key: 'delivery', label: 'Delivery' },
];

const CLIENTES_LABELS: { key: keyof PricingConfig; label: string; hint: string }[] = [
  { key: 'serviceFeePercent', label: 'Cargo por servicio (%)', hint: 'ej. 0.03 = 3%' },
  { key: 'serviceFeeFixed', label: 'Cargo por servicio (fijo, USD)', hint: 'monto fijo en dólares' },
  { key: 'defaultTaxPercent', label: 'Impuesto por defecto', hint: 'ej. 0.12 = 12%' },
];

const DELIVERY_FARE_LABELS: { key: keyof DeliveryFareConfig; label: string; hint: string; step?: string }[] = [
  { key: 'minFareDay', label: 'Tarifa mínima diurna (USD)', hint: 'piso de la tarifa entre nightEndHour y nightStartHour' },
  { key: 'minFareNight', label: 'Tarifa mínima nocturna (USD)', hint: 'piso de la tarifa fuera de ese horario' },
  { key: 'nightStartHour', label: 'Hora de inicio nocturno', hint: '0-23, hora local del negocio. Ej. 20 = 8pm', step: '1' },
  { key: 'nightEndHour', label: 'Hora de fin nocturno', hint: '0-23, hora local del negocio. Ej. 6 = 6am', step: '1' },
  { key: 'perKmRate', label: 'Precio por km (USD)', hint: '' },
  { key: 'perMinuteRate', label: 'Precio por minuto (USD)', hint: '' },
  { key: 'surgeThreshold', label: 'Umbral de demanda alta', hint: 'ratio pedidos esperando rider / riders disponibles' },
  { key: 'surgeMultiplier', label: 'Multiplicador por demanda alta', hint: '1 = sin aumento, 1.5 = +50%' },
  { key: 'bingoCommissionPercent', label: '% que se queda BINGO+', hint: 'ej. 0.2 = 20% de la tarifa' },
  { key: 'riderTaxWithholdingPercent', label: '% de impuesto retenido al rider', hint: 'ej. 0.08 = 8%, sobre lo que queda tras la comisión' },
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
  step = '0.01',
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
  const [commissionRate, setCommissionRate] = useState<number | null>(null);
  const [deliveryFare, setDeliveryFare] = useState<DeliveryFareConfig | null>(null);
  const [weightsBusy, setWeightsBusy] = useState(false);
  const [pricingBusy, setPricingBusy] = useState(false);
  const [commissionBusy, setCommissionBusy] = useState(false);
  const [deliveryFareBusy, setDeliveryFareBusy] = useState(false);
  const [weightsMsg, setWeightsMsg] = useState<string | null>(null);
  const [pricingMsg, setPricingMsg] = useState<string | null>(null);
  const [commissionMsg, setCommissionMsg] = useState<string | null>(null);
  const [deliveryFareMsg, setDeliveryFareMsg] = useState<string | null>(null);
  const [weightsErr, setWeightsErr] = useState<string | null>(null);
  const [pricingErr, setPricingErr] = useState<string | null>(null);
  const [commissionErr, setCommissionErr] = useState<string | null>(null);
  const [deliveryFareErr, setDeliveryFareErr] = useState<string | null>(null);
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
    apiFetch<{ rate: number }>('/admin/settings/default-commission-rate').then((r) => setCommissionRate(r.rate)).catch(() => setCommissionRate(null));
    apiFetch<DeliveryFareConfig>('/admin/settings/delivery-fare').then(setDeliveryFare).catch(() => setDeliveryFare(null));
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
      setPricingMsg('Cargos al cliente actualizados.');
    } catch (err) {
      setPricingErr(err instanceof ApiError ? err.message : 'No se pudo guardar.');
    } finally {
      setPricingBusy(false);
    }
  }

  async function saveCommissionRate() {
    if (commissionRate === null) return;
    setCommissionBusy(true);
    setCommissionErr(null);
    setCommissionMsg(null);
    try {
      const saved = await apiFetch<{ rate: number }>('/admin/settings/default-commission-rate', {
        method: 'PATCH',
        body: JSON.stringify({ rate: commissionRate }),
      });
      setCommissionRate(saved.rate);
      setCommissionMsg('Comisión por defecto actualizada.');
    } catch (err) {
      setCommissionErr(err instanceof ApiError ? err.message : 'No se pudo guardar.');
    } finally {
      setCommissionBusy(false);
    }
  }

  async function saveDeliveryFare() {
    if (!deliveryFare) return;
    setDeliveryFareBusy(true);
    setDeliveryFareErr(null);
    setDeliveryFareMsg(null);
    try {
      const saved = await apiFetch<DeliveryFareConfig>('/admin/settings/delivery-fare', {
        method: 'PATCH',
        body: JSON.stringify(deliveryFare),
      });
      setDeliveryFare(saved);
      setDeliveryFareMsg('Tarifas de delivery actualizadas.');
    } catch (err) {
      setDeliveryFareErr(err instanceof ApiError ? err.message : 'No se pudo guardar.');
    } finally {
      setDeliveryFareBusy(false);
    }
  }

  return (
    <AdminShell>
      <h1 className="bingo-page-title" style={{ marginBottom: 24 }}>Variables</h1>

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
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px' }}>Negocios</h2>
          <p style={{ fontSize: 12, color: '#7f8ea3', margin: '0 0 12px' }}>
            Lo que BINGO+ le cobra al negocio — un % sobre la venta, nunca sobre venta + impuestos, y nunca un
            cargo extra al cliente. La tasa real de cada negocio queda congelada en su contrato al aprobarlo; esto
            es solo la tasa por defecto que se usa cuando no se especifica una manual.
          </p>

          {commissionRate === null ? (
            <p>Cargando…</p>
          ) : (
            <>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                Comisión por defecto <span style={{ fontWeight: 400, color: '#9aa5b1' }}>(ej. 0.15 = 15%)</span>
              </label>
              <div style={{ marginBottom: 10 }}>
                <NumberField min={0} max={1} value={commissionRate} onChange={setCommissionRate} />
              </div>

              {commissionErr && <div style={{ color: 'var(--bingo-error)', fontSize: 13, marginBottom: 10 }}>{commissionErr}</div>}
              {commissionMsg && <div style={{ color: 'var(--bingo-success)', fontSize: 13, marginBottom: 10 }}>{commissionMsg}</div>}

              <button className="bingo-button" disabled={commissionBusy} onClick={saveCommissionRate}>
                {commissionBusy ? 'Guardando…' : 'Guardar comisión'}
              </button>
            </>
          )}
        </div>

        <div className="bingo-card">
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px' }}>Clientes</h2>
          <p style={{ fontSize: 12, color: '#7f8ea3', margin: '0 0 12px' }}>
            Cargos que paga el cliente en el checkout — separado de la comisión del negocio.
          </p>

          {pricing === null ? (
            <p>Cargando…</p>
          ) : (
            <>
              {CLIENTES_LABELS.map((p) => (
                <div key={p.key} style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                    {p.label} <span style={{ fontWeight: 400, color: '#9aa5b1' }}>({p.hint})</span>
                  </label>
                  <NumberField
                    min={0}
                    value={pricing[p.key]}
                    onChange={(value) => setPricing({ ...pricing, [p.key]: value })}
                  />
                </div>
              ))}

              {pricingErr && <div style={{ color: 'var(--bingo-error)', fontSize: 13, marginBottom: 10 }}>{pricingErr}</div>}
              {pricingMsg && <div style={{ color: 'var(--bingo-success)', fontSize: 13, marginBottom: 10 }}>{pricingMsg}</div>}

              <button className="bingo-button" disabled={pricingBusy} onClick={savePricing}>
                {pricingBusy ? 'Guardando…' : 'Guardar cargos'}
              </button>
            </>
          )}
        </div>

        <div className="bingo-card">
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px' }}>Tarifas de delivery</h2>
          <p style={{ fontSize: 12, color: '#7f8ea3', margin: '0 0 12px' }}>
            El delivery es un acuerdo de BINGO+ con el Rider — el negocio nunca fija esta tarifa. Se cobra al
            cliente y de ahí sale lo que se queda BINGO+ y lo que se retiene de impuesto al rider.
          </p>

          {deliveryFare === null ? (
            <p>Cargando…</p>
          ) : (
            <>
              {DELIVERY_FARE_LABELS.map((f) => (
                <div key={f.key} style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                    {f.label} {f.hint && <span style={{ fontWeight: 400, color: '#9aa5b1' }}>({f.hint})</span>}
                  </label>
                  <NumberField
                    min={0}
                    max={f.key === 'nightStartHour' || f.key === 'nightEndHour' ? 23 : undefined}
                    step={f.step}
                    value={deliveryFare[f.key]}
                    onChange={(value) => setDeliveryFare({ ...deliveryFare, [f.key]: value })}
                  />
                </div>
              ))}

              {deliveryFareErr && <div style={{ color: 'var(--bingo-error)', fontSize: 13, marginBottom: 10 }}>{deliveryFareErr}</div>}
              {deliveryFareMsg && <div style={{ color: 'var(--bingo-success)', fontSize: 13, marginBottom: 10 }}>{deliveryFareMsg}</div>}

              <button className="bingo-button" disabled={deliveryFareBusy} onClick={saveDeliveryFare}>
                {deliveryFareBusy ? 'Guardando…' : 'Guardar tarifas'}
              </button>
            </>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
