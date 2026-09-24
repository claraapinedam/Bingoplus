'use client';

import { useEffect, useRef, useState } from 'react';
import { Autocomplete, useJsApiLoader } from '@react-google-maps/api';
import AdminShell from '@/components/AdminShell';
import { apiFetch, decodeRoles, getAccessToken, ApiError } from '@/lib/api';
import { GOOGLE_MAPS_LIBRARIES, GOOGLE_MAPS_LOADER_ID } from '@/lib/googleMaps';

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

/** Rider matching/dispatch — never a pricing/commission concern (see DELIVERY_FARE_LABELS above
 * for that). radiusExpansionKm is edited as a comma-separated list of km steps. */
interface DispatchConfig {
  distanceWeight: number;
  ratingWeight: number;
  availabilityWeight: number;
  maxSearchRadiusKm: number;
  assignmentTimeoutSeconds: number;
  etaWeight: number;
  maxCandidatesForEta: number;
  locationStaleThresholdSeconds: number;
  radiusExpansionKm: number[];
  retryBackoffSeconds: number;
  maxDispatchAttempts: number;
}

/** BINGO+'s own legal identity (razón social, RUC, dirección, representante legal) — feeds the
 * "[RAZÓN SOCIAL BINGO+]"/"[RUC BINGO+]"/"[DIRECCIÓN BINGO+]"/"[REPRESENTANTE LEGAL BINGO+]"
 * placeholders in the per-business affiliation contract text (ContractsService). Contract
 * generation fails until this is configured at least once. */
interface LegalInfoConfig {
  legalName: string;
  taxId: string;
  addressLine: string;
  latitude: number | null;
  longitude: number | null;
  legalRepresentativeName: string;
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

const DISPATCH_CONFIG_LABELS: { key: Exclude<keyof DispatchConfig, 'radiusExpansionKm'>; label: string; hint: string; step?: string }[] = [
  { key: 'etaWeight', label: 'Peso del tiempo real de llegada (ETA)', hint: 'ej. 0.6 = criterio principal de emparejamiento' },
  { key: 'distanceWeight', label: 'Peso de la distancia', hint: 'filtro barato antes de calcular el ETA real' },
  { key: 'ratingWeight', label: 'Peso de la calificación', hint: '' },
  { key: 'availabilityWeight', label: 'Peso de disponibilidad', hint: 'reservado, la disponibilidad ya es un filtro obligatorio' },
  { key: 'maxSearchRadiusKm', label: 'Radio máximo de búsqueda (km)', hint: '' },
  { key: 'maxCandidatesForEta', label: 'Candidatos evaluados con ETA real', hint: 'de los más cercanos, cuántos reciben la llamada a Maps', step: '1' },
  { key: 'locationStaleThresholdSeconds', label: 'Antigüedad máxima de ubicación (segundos)', hint: 'un rider con GPS más viejo que esto no se ofrece', step: '1' },
  { key: 'assignmentTimeoutSeconds', label: 'Tiempo para responder una oferta (segundos)', hint: 'pasado esto, se reasigna a otro repartidor', step: '1' },
  { key: 'retryBackoffSeconds', label: 'Espera antes de reintentar (segundos)', hint: 'si no se encontró repartidor, cuánto esperar antes de buscar de nuevo', step: '1' },
  { key: 'maxDispatchAttempts', label: 'Intentos máximos de despacho', hint: 'límite de seguridad — nunca falla el pedido, solo deja de reintentar solo', step: '1' },
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
  const [dispatchConfig, setDispatchConfig] = useState<DispatchConfig | null>(null);
  const [radiusExpansionText, setRadiusExpansionText] = useState('');
  const [legalInfo, setLegalInfo] = useState<LegalInfoConfig | null>(null);
  const [weightsBusy, setWeightsBusy] = useState(false);
  const [pricingBusy, setPricingBusy] = useState(false);
  const [commissionBusy, setCommissionBusy] = useState(false);
  const [deliveryFareBusy, setDeliveryFareBusy] = useState(false);
  const [dispatchBusy, setDispatchBusy] = useState(false);
  const [legalInfoBusy, setLegalInfoBusy] = useState(false);
  const [weightsMsg, setWeightsMsg] = useState<string | null>(null);
  const [pricingMsg, setPricingMsg] = useState<string | null>(null);
  const [commissionMsg, setCommissionMsg] = useState<string | null>(null);
  const [deliveryFareMsg, setDeliveryFareMsg] = useState<string | null>(null);
  const [dispatchMsg, setDispatchMsg] = useState<string | null>(null);
  const [legalInfoMsg, setLegalInfoMsg] = useState<string | null>(null);
  const [weightsErr, setWeightsErr] = useState<string | null>(null);
  const [pricingErr, setPricingErr] = useState<string | null>(null);
  const [commissionErr, setCommissionErr] = useState<string | null>(null);
  const [deliveryFareErr, setDeliveryFareErr] = useState<string | null>(null);
  const [dispatchErr, setDispatchErr] = useState<string | null>(null);
  const [legalInfoErr, setLegalInfoErr] = useState<string | null>(null);
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
    apiFetch<DispatchConfig>('/admin/settings/dispatch-config')
      .then((config) => {
        setDispatchConfig(config);
        setRadiusExpansionText(config.radiusExpansionKm.join(', '));
      })
      .catch(() => setDispatchConfig(null));
    apiFetch<LegalInfoConfig>('/admin/settings/legal-info').then(setLegalInfo).catch(() => setLegalInfo(null));
  }, []);

  const { isLoaded: mapsLoaded } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
    libraries: GOOGLE_MAPS_LIBRARIES,
  });
  const legalAddressAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  function handleLegalAddressPlaceChanged() {
    const place = legalAddressAutocompleteRef.current?.getPlace();
    if (!place?.geometry?.location || !legalInfo) return;
    setLegalInfo({
      ...legalInfo,
      addressLine: place.formatted_address ?? place.name ?? legalInfo.addressLine,
      latitude: place.geometry.location.lat(),
      longitude: place.geometry.location.lng(),
    });
  }

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

  function parseRadiusExpansion(text: string): number[] | null {
    const parts = text
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    if (parts.length === 0) return null;
    const parsed = parts.map(Number);
    if (parsed.some((n) => Number.isNaN(n) || !Number.isInteger(n) || n < 1)) return null;
    return parsed;
  }

  async function saveDispatchConfig() {
    if (!dispatchConfig) return;
    const radiusExpansionKm = parseRadiusExpansion(radiusExpansionText);
    if (!radiusExpansionKm) {
      setDispatchErr('Los pasos de radio deben ser números enteros positivos separados por comas (ej. 2, 4, 6, 8).');
      return;
    }
    setDispatchBusy(true);
    setDispatchErr(null);
    setDispatchMsg(null);
    try {
      const saved = await apiFetch<DispatchConfig>('/admin/settings/dispatch-config', {
        method: 'PATCH',
        body: JSON.stringify({ ...dispatchConfig, radiusExpansionKm }),
      });
      setDispatchConfig(saved);
      setRadiusExpansionText(saved.radiusExpansionKm.join(', '));
      setDispatchMsg('Configuración de despacho actualizada.');
    } catch (err) {
      setDispatchErr(err instanceof ApiError ? err.message : 'No se pudo guardar.');
    } finally {
      setDispatchBusy(false);
    }
  }

  async function saveLegalInfo() {
    if (!legalInfo) return;
    setLegalInfoBusy(true);
    setLegalInfoErr(null);
    setLegalInfoMsg(null);
    try {
      const body: Record<string, unknown> = {
        legalName: legalInfo.legalName,
        taxId: legalInfo.taxId,
        addressLine: legalInfo.addressLine,
        legalRepresentativeName: legalInfo.legalRepresentativeName,
      };
      if (legalInfo.latitude != null) body.latitude = legalInfo.latitude;
      if (legalInfo.longitude != null) body.longitude = legalInfo.longitude;
      const saved = await apiFetch<LegalInfoConfig>('/admin/settings/legal-info', {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setLegalInfo(saved);
      setLegalInfoMsg('Información legal de BINGO+ actualizada.');
    } catch (err) {
      setLegalInfoErr(err instanceof ApiError ? err.message : 'No se pudo guardar.');
    } finally {
      setLegalInfoBusy(false);
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

        <div className="bingo-card">
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px' }}>Emparejamiento de repartidores</h2>
          <p style={{ fontSize: 12, color: '#7f8ea3', margin: '0 0 12px' }}>
            Cómo se busca y asigna un repartidor a una entrega — nunca afecta precios ni comisiones. El ETA real
            (tiempo estimado de llegada) es el criterio principal; la distancia es solo un filtro barato inicial.
          </p>

          {dispatchConfig === null ? (
            <p>Cargando…</p>
          ) : (
            <>
              {DISPATCH_CONFIG_LABELS.map((f) => (
                <div key={f.key} style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                    {f.label} {f.hint && <span style={{ fontWeight: 400, color: '#9aa5b1' }}>({f.hint})</span>}
                  </label>
                  <NumberField
                    min={0}
                    step={f.step}
                    value={dispatchConfig[f.key]}
                    onChange={(value) => setDispatchConfig({ ...dispatchConfig, [f.key]: value })}
                  />
                </div>
              ))}

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                  Pasos de expansión de radio (km){' '}
                  <span style={{ fontWeight: 400, color: '#9aa5b1' }}>(se intentan en orden hasta encontrar un candidato)</span>
                </label>
                <input
                  className="bingo-input"
                  value={radiusExpansionText}
                  placeholder="2, 4, 6, 8"
                  onChange={(e) => setRadiusExpansionText(e.target.value)}
                />
              </div>

              {dispatchErr && <div style={{ color: 'var(--bingo-error)', fontSize: 13, marginBottom: 10 }}>{dispatchErr}</div>}
              {dispatchMsg && <div style={{ color: 'var(--bingo-success)', fontSize: 13, marginBottom: 10 }}>{dispatchMsg}</div>}

              <button className="bingo-button" disabled={dispatchBusy} onClick={saveDispatchConfig}>
                {dispatchBusy ? 'Guardando…' : 'Guardar emparejamiento'}
              </button>
            </>
          )}
        </div>

        <div className="bingo-card">
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px' }}>Información legal de BINGO+</h2>
          <p style={{ fontSize: 12, color: '#7f8ea3', margin: '0 0 12px' }}>
            Razón social, RUC, dirección y representante legal de BINGO+ — se usan para llenar el contrato de
            afiliación que firma cada negocio. Sin esto configurado, la generación de contratos falla.
          </p>

          {legalInfo === null ? (
            <p>Cargando…</p>
          ) : (
            <>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Razón social</label>
                <input
                  className="bingo-input"
                  value={legalInfo.legalName}
                  onChange={(e) => setLegalInfo({ ...legalInfo, legalName: e.target.value })}
                />
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>RUC</label>
                <input
                  className="bingo-input"
                  value={legalInfo.taxId}
                  onChange={(e) => setLegalInfo({ ...legalInfo, taxId: e.target.value })}
                />
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Dirección</label>
                {mapsLoaded ? (
                  <Autocomplete
                    onLoad={(ac) => {
                      legalAddressAutocompleteRef.current = ac;
                    }}
                    onPlaceChanged={handleLegalAddressPlaceChanged}
                    options={{ componentRestrictions: { country: 'ec' }, fields: ['formatted_address', 'name', 'geometry'] }}
                  >
                    <input
                      className="bingo-input"
                      value={legalInfo.addressLine}
                      onChange={(e) => setLegalInfo({ ...legalInfo, addressLine: e.target.value })}
                    />
                  </Autocomplete>
                ) : (
                  <input
                    className="bingo-input"
                    value={legalInfo.addressLine}
                    onChange={(e) => setLegalInfo({ ...legalInfo, addressLine: e.target.value })}
                  />
                )}
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Representante legal</label>
                <input
                  className="bingo-input"
                  value={legalInfo.legalRepresentativeName}
                  onChange={(e) => setLegalInfo({ ...legalInfo, legalRepresentativeName: e.target.value })}
                />
              </div>

              {legalInfoErr && <div style={{ color: 'var(--bingo-error)', fontSize: 13, marginBottom: 10 }}>{legalInfoErr}</div>}
              {legalInfoMsg && <div style={{ color: 'var(--bingo-success)', fontSize: 13, marginBottom: 10 }}>{legalInfoMsg}</div>}

              <button className="bingo-button" disabled={legalInfoBusy} onClick={saveLegalInfo}>
                {legalInfoBusy ? 'Guardando…' : 'Guardar'}
              </button>
            </>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
