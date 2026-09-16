'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { apiFetch, ApiError } from '@/lib/api';

type AdminCouponType =
  | 'PERCENTAGE_DISCOUNT'
  | 'FIXED_AMOUNT_DISCOUNT'
  | 'FREE_MONTHS'
  | 'FREE_TRIAL_EXTENSION';

const TYPE_LABELS: Record<AdminCouponType, string> = {
  PERCENTAGE_DISCOUNT: 'Descuento %',
  FIXED_AMOUNT_DISCOUNT: 'Descuento fijo',
  FREE_MONTHS: 'Meses gratis',
  FREE_TRIAL_EXTENSION: 'Extender trial',
};

interface AdminCoupon {
  id: string;
  code: string;
  name: string;
  discountType: AdminCouponType;
  discountValue: string | null; // Prisma Decimal serializes as a string over JSON
  freeMonths: number | null;
  startDate: string;
  expirationDate: string;
  usageLimit: number | null;
  usagePerBusiness: number | null;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'CANCELLED';
}

const EMPTY_FORM = {
  code: '',
  name: '',
  discountType: 'PERCENTAGE_DISCOUNT' as AdminCouponType,
  discountValue: '',
  freeMonths: '',
  startDate: '',
  expirationDate: '',
  usageLimit: '',
  usagePerBusiness: '',
};

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<AdminCoupon[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setCoupons(await apiFetch<AdminCoupon[]>('/admin/coupons'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron cargar los cupones.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createCoupon(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const isFreeMonths = form.discountType === 'FREE_MONTHS';
      await apiFetch('/admin/coupons', {
        method: 'POST',
        body: JSON.stringify({
          code: form.code,
          name: form.name,
          discountType: form.discountType,
          discountValue: isFreeMonths ? undefined : Number(form.discountValue),
          freeMonths: isFreeMonths ? Number(form.freeMonths) : undefined,
          startDate: new Date(form.startDate).toISOString(),
          expirationDate: new Date(form.expirationDate).toISOString(),
          usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
          usagePerBusiness: form.usagePerBusiness ? Number(form.usagePerBusiness) : undefined,
        }),
      });
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el cupón.');
    } finally {
      setSubmitting(false);
    }
  }

  async function setStatus(coupon: AdminCoupon, status: string) {
    try {
      await apiFetch(`/admin/coupons/${coupon.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar el cupón.');
    }
  }

  return (
    <AdminShell>
      <h1 className="bingo-page-title">Cupones de Plataforma</h1>
      <p className="bingo-page-subtitle">
        Sólo afectan la facturación de Membresía de un negocio — nunca el Marketplace ni los
        cupones propios de cada tienda (dominios financieros separados, RULE 16/17). &quot;Meses
        gratis&quot; extiende de verdad el periodo de facturación, nunca es simulado.
      </p>

      {error && (
        <div className="bingo-card" style={{ marginBottom: 16, color: 'var(--bingo-error)' }}>
          {error}
        </div>
      )}

      <div className="bingo-card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 12px' }}>Nuevo cupón</h2>
        <form
          onSubmit={createCoupon}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, alignItems: 'end' }}
        >
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Código</label>
            <input
              className="bingo-input"
              required
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Nombre</label>
            <input
              className="bingo-input"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Tipo</label>
            <select
              className="bingo-input"
              value={form.discountType}
              onChange={(e) => setForm({ ...form, discountType: e.target.value as AdminCouponType })}
            >
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {form.discountType === 'FREE_MONTHS' ? (
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                Meses gratis
              </label>
              <input
                className="bingo-input"
                type="number"
                min={1}
                required
                value={form.freeMonths}
                onChange={(e) => setForm({ ...form, freeMonths: e.target.value })}
              />
            </div>
          ) : form.discountType !== 'FREE_TRIAL_EXTENSION' ? (
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                Valor del descuento
              </label>
              <input
                className="bingo-input"
                type="number"
                min={0}
                required
                value={form.discountValue}
                onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
              />
            </div>
          ) : (
            <div />
          )}

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
              Fecha inicio
            </label>
            <input
              className="bingo-input"
              type="date"
              required
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
              Fecha expiración
            </label>
            <input
              className="bingo-input"
              type="date"
              required
              value={form.expirationDate}
              onChange={(e) => setForm({ ...form, expirationDate: e.target.value })}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
              Límite de uso global (opcional)
            </label>
            <input
              className="bingo-input"
              type="number"
              min={1}
              value={form.usageLimit}
              onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
              Límite por negocio (opcional)
            </label>
            <input
              className="bingo-input"
              type="number"
              min={1}
              value={form.usagePerBusiness}
              onChange={(e) => setForm({ ...form, usagePerBusiness: e.target.value })}
            />
          </div>

          <button className="bingo-button" disabled={submitting}>
            Crear cupón
          </button>
        </form>
      </div>

      <div className="bingo-card">
        {coupons === null ? (
          <p>Cargando…</p>
        ) : coupons.length === 0 ? (
          <p>Todavía no hay ningún cupón.</p>
        ) : (
          <table className="bingo-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>Valor</th>
                <th>Vigencia</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id}>
                  <td>
                    <code>{c.code}</code>
                  </td>
                  <td>{c.name}</td>
                  <td>{TYPE_LABELS[c.discountType]}</td>
                  <td>
                    {c.discountType === 'FREE_MONTHS'
                      ? `${c.freeMonths} mes(es)`
                      : c.discountType === 'FREE_TRIAL_EXTENSION'
                        ? '—'
                        : c.discountValue}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {new Date(c.startDate).toLocaleDateString('es-EC')} –{' '}
                    {new Date(c.expirationDate).toLocaleDateString('es-EC')}
                  </td>
                  <td>
                    <span className={`bingo-badge badge-${c.status.toLowerCase()}`}>{c.status}</span>
                  </td>
                  <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {c.status !== 'ACTIVE' && (
                      <button className="bingo-button" onClick={() => setStatus(c, 'ACTIVE')}>
                        Activar
                      </button>
                    )}
                    {c.status === 'ACTIVE' && (
                      <button className="bingo-button secondary" onClick={() => setStatus(c, 'PAUSED')}>
                        Pausar
                      </button>
                    )}
                    {c.status !== 'CANCELLED' && (
                      <button className="bingo-button danger" onClick={() => setStatus(c, 'CANCELLED')}>
                        Cancelar
                      </button>
                    )}
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
