'use client';

import { FormEvent, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';

/** Redeems a CommissionCoupon (admin-issued acquisition/retention promo) — success lowers the cut
 * BINGO+ takes from this rider's completed deliveries until the coupon's own expiration date, then
 * it reverts on its own. See DeliveryFareConfigService.getEffectiveCommissionPercent on the
 * backend for how the reduced rate actually takes effect. */
export default function CommissionCouponCard() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function redeem(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    setSuccess(false);
    try {
      await apiFetch('/me/rider/commission-coupons/redeem', {
        method: 'POST',
        body: JSON.stringify({ code: code.trim().toUpperCase() }),
      });
      setSuccess(true);
      setCode('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo redimir el cupón.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bingo-card" style={{ marginTop: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 13 }}>Cupón de comisión</div>
      <p style={{ fontSize: 12, color: '#7f8ea3', margin: '0 0 10px' }}>
        Si BINGO+ te dio un código promocional, ingrésalo aquí para reducir temporalmente lo que se te descuenta por
        entrega hasta la fecha de vigencia del cupón.
      </p>
      <form onSubmit={redeem} style={{ display: 'flex', gap: 8 }}>
        <input
          className="bingo-input"
          style={{ flex: 1 }}
          placeholder="Código"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button className="bingo-button" type="submit" disabled={busy || !code.trim()} style={{ width: 'auto' }}>
          {busy ? 'Redimiendo…' : 'Redimir'}
        </button>
      </form>
      {error && <div style={{ fontSize: 12, color: 'var(--bingo-error)', marginTop: 8 }}>{error}</div>}
      {success && <div style={{ fontSize: 12, color: 'var(--bingo-success)', marginTop: 8 }}>¡Cupón aplicado! Tu nueva comisión ya está activa.</div>}
    </div>
  );
}
