'use client';

import { FormEvent, useEffect, useState } from 'react';
import DashboardShell, { useBusiness } from '@/components/DashboardShell';
import { apiFetch, ApiError, getActiveBusinessId } from '@/lib/api';

const WEEKDAYS: { key: string; label: string }[] = [
  { key: 'mon', label: 'Lunes' },
  { key: 'tue', label: 'Martes' },
  { key: 'wed', label: 'Miércoles' },
  { key: 'thu', label: 'Jueves' },
  { key: 'fri', label: 'Viernes' },
  { key: 'sat', label: 'Sábado' },
  { key: 'sun', label: 'Domingo' },
];

type Hours = Record<string, { open: string; close: string }>;

function ProfileContent() {
  const { business, reload } = useBusiness();
  const businessId = getActiveBusinessId();
  const [tradeName, setTradeName] = useState(business.tradeName);
  const [description, setDescription] = useState(business.description ?? '');
  const [logoUrl, setLogoUrl] = useState(business.logoUrl ?? '');
  const [coverImageUrl, setCoverImageUrl] = useState(business.coverImageUrl ?? '');
  const [deliveryFeeUsd, setDeliveryFeeUsd] = useState(business.deliveryFeeUsd?.toString() ?? '');
  const [deliveryEstimateMinutes, setDeliveryEstimateMinutes] = useState(business.deliveryEstimateMinutes?.toString() ?? '');
  const [hours, setHours] = useState<Hours>(business.openingHours ?? {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(false);
  }, [tradeName, description, logoUrl, coverImageUrl, deliveryFeeUsd, deliveryEstimateMinutes, hours]);

  function toggleDay(key: string, enabled: boolean) {
    setHours((prev) => {
      const next = { ...prev };
      if (enabled) next[key] = next[key] ?? { open: '09:00', close: '18:00' };
      else delete next[key];
      return next;
    });
  }

  function setDayTime(key: string, field: 'open' | 'close', value: string) {
    setHours((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!businessId) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/me/business/${businessId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          tradeName,
          description: description || undefined,
          logoUrl: logoUrl || undefined,
          coverImageUrl: coverImageUrl || undefined,
          openingHours: hours,
          deliveryFeeUsd: deliveryFeeUsd ? Number(deliveryFeeUsd) : undefined,
          deliveryEstimateMinutes: deliveryEstimateMinutes ? Number(deliveryEstimateMinutes) : undefined,
        }),
      });
      reload();
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el perfil.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="dashboard-page-header">
        <div>
          <div className="dashboard-page-title">Perfil del negocio</div>
          <div className="dashboard-page-subtitle">
            Esta información alimenta tu ficha pública en el Directorio de BINGO+
            {business.capabilities.DIRECTORY_LISTING ? '' : ' (el directorio está deshabilitado para tu negocio)'}.
          </div>
        </div>
      </header>

      <div className="bingo-card" style={{ maxWidth: 640, marginBottom: 20, fontSize: 13 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Datos administrativos (solo lectura)</div>
        <div style={{ color: '#54617a', lineHeight: 1.8 }}>
          Razón social: {business.legalName}
          <br />
          Dirección: {business.addressLine}, {business.city}
          <br />
          Teléfono: {business.phone} · Email: {business.email}
          <br />
          Categoría: {business.category.name}
        </div>
        <div style={{ fontSize: 11, color: '#9aa5b1', marginTop: 8 }}>
          Estos datos solo puede modificarlos un administrador de BINGO+.
        </div>
      </div>

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Nombre comercial</label>
          <input className="bingo-input" required value={tradeName} onChange={(e) => setTradeName(e.target.value)} />
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Descripción</label>
          <textarea className="bingo-input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="dashboard-form-grid">
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Logo (URL)</label>
            <input className="bingo-input" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Portada (URL)</label>
            <input className="bingo-input" value={coverImageUrl} onChange={(e) => setCoverImageUrl(e.target.value)} />
          </div>
        </div>

        {business.capabilities.SELLS_PRODUCTS && business.capabilities.DELIVERY && (
          <div className="dashboard-form-grid">
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Tarifa de envío (USD)</label>
              <input className="bingo-input" type="number" min={0} step="0.01" value={deliveryFeeUsd} onChange={(e) => setDeliveryFeeUsd(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Tiempo estimado (min)</label>
              <input
                className="bingo-input"
                type="number"
                min={0}
                step="1"
                value={deliveryEstimateMinutes}
                onChange={(e) => setDeliveryEstimateMinutes(e.target.value)}
              />
            </div>
          </div>
        )}

        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 8 }}>Horario de atención</label>
          {WEEKDAYS.map((d) => (
            <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <input type="checkbox" checked={!!hours[d.key]} onChange={(e) => toggleDay(d.key, e.target.checked)} />
              <span style={{ fontSize: 13, width: 80 }}>{d.label}</span>
              {hours[d.key] && (
                <>
                  <input
                    className="bingo-input"
                    type="time"
                    style={{ width: 120 }}
                    value={hours[d.key].open}
                    onChange={(e) => setDayTime(d.key, 'open', e.target.value)}
                  />
                  <span style={{ fontSize: 12, color: '#9aa5b1' }}>a</span>
                  <input
                    className="bingo-input"
                    type="time"
                    style={{ width: 120 }}
                    value={hours[d.key].close}
                    onChange={(e) => setDayTime(d.key, 'close', e.target.value)}
                  />
                </>
              )}
            </div>
          ))}
        </div>

        {error && <div className="bingo-error-banner">{error}</div>}
        {saved && <div style={{ fontSize: 12, color: 'var(--bingo-success)' }}>Perfil actualizado.</div>}

        <button className="bingo-button" type="submit" disabled={saving} style={{ width: 'auto', alignSelf: 'flex-start', padding: '12px 28px' }}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>
    </>
  );
}

export default function ProfilePage() {
  return (
    <DashboardShell>
      <ProfileContent />
    </DashboardShell>
  );
}
