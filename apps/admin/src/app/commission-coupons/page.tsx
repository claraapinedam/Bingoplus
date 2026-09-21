'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import IconButton from '@/components/IconButton';
import { apiFetch, ApiError } from '@/lib/api';

type TargetType = 'BUSINESS' | 'RIDER';

const TARGET_LABELS: Record<TargetType, string> = {
  BUSINESS: 'Tiendas',
  RIDER: 'Riders',
};

interface CommissionCoupon {
  id: string;
  code: string;
  name: string;
  targetType: TargetType;
  commissionPercent: string; // Prisma Decimal serializes as a string over JSON
  startDate: string;
  expirationDate: string;
  usageLimit: number | null;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'CANCELLED';
  _count: { redemptions: number };
}

const EMPTY_FORM = {
  code: '',
  name: '',
  targetType: 'RIDER' as TargetType,
  commissionPercent: '',
  startDate: '',
  expirationDate: '',
  usageLimit: '',
};

export default function CommissionCouponsPage() {
  const [coupons, setCoupons] = useState<CommissionCoupon[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setCoupons(await apiFetch<CommissionCoupon[]>('/admin/commission-coupons'));
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
      await apiFetch('/admin/commission-coupons', {
        method: 'POST',
        body: JSON.stringify({
          code: form.code,
          name: form.name,
          targetType: form.targetType,
          // Admin types a whole percent (e.g. 10 for 10%) — the API stores/consumes it as a 0-1
          // fraction, same convention as every other commission-rate field in the platform.
          commissionPercent: Number(form.commissionPercent) / 100,
          startDate: new Date(form.startDate).toISOString(),
          expirationDate: new Date(form.expirationDate).toISOString(),
          usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
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

  async function setStatus(coupon: CommissionCoupon, status: string) {
    try {
      await apiFetch(`/admin/commission-coupons/${coupon.id}/status`, {
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
      <h1 className="bingo-page-title" style={{ marginBottom: 8 }}>Cupones de Comisión</h1>
      <p style={{ fontSize: 13, color: '#7f8ea3', margin: '0 0 24px' }}>
        Ofrece temporalmente una comisión de BINGO+ más baja a Tiendas o Riders (adquisición/retención) — quien redima el
        código paga esa tasa hasta la fecha de expiración del cupón, luego vuelve sola a su tasa normal.
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
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Aplica a</label>
            <select
              className="bingo-input"
              value={form.targetType}
              onChange={(e) => setForm({ ...form, targetType: e.target.value as TargetType })}
            >
              {Object.entries(TARGET_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
              Comisión BINGO+ (%)
            </label>
            <input
              className="bingo-input"
              type="number"
              min={0}
              max={100}
              step="0.01"
              required
              placeholder="ej. 10"
              value={form.commissionPercent}
              onChange={(e) => setForm({ ...form, commissionPercent: e.target.value })}
            />
          </div>

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
                <th>Aplica a</th>
                <th>Comisión</th>
                <th>Vigencia</th>
                <th>Redenciones</th>
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
                  <td>{TARGET_LABELS[c.targetType]}</td>
                  <td>{(Number(c.commissionPercent) * 100).toFixed(2)}%</td>
                  <td style={{ fontSize: 12 }}>
                    {new Date(c.startDate).toLocaleDateString('es-EC')} –{' '}
                    {new Date(c.expirationDate).toLocaleDateString('es-EC')}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {c._count.redemptions} redimido(s){c.usageLimit != null ? ` / ${c.usageLimit} global` : ''}
                  </td>
                  <td>
                    <span className={`bingo-badge badge-${c.status.toLowerCase()}`}>{c.status}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      {c.status !== 'ACTIVE' && <IconButton icon="approve" label="Activar" onClick={() => setStatus(c, 'ACTIVE')} />}
                      {c.status === 'ACTIVE' && <IconButton icon="pause" label="Pausar" onClick={() => setStatus(c, 'PAUSED')} />}
                      {c.status !== 'CANCELLED' && <IconButton icon="reject" label="Cancelar" onClick={() => setStatus(c, 'CANCELLED')} />}
                    </div>
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
