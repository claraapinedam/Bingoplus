'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { apiFetch, ApiError } from '@/lib/api';

interface MembershipPlan {
  id: string;
  name: string;
  description: string | null;
  price: string; // Prisma Decimal serializes as a string over JSON
  currency: string;
  billingFrequency: 'MONTHLY' | 'YEARLY';
  trialDays: number;
  isDefault: boolean;
  status: 'ACTIVE' | 'INACTIVE';
}

const EMPTY_FORM = {
  name: '',
  description: '',
  price: '',
  billingFrequency: 'MONTHLY' as 'MONTHLY' | 'YEARLY',
  trialDays: '0',
  isDefault: false,
};

export default function MembershipPlansPage() {
  const [plans, setPlans] = useState<MembershipPlan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPlans(await apiFetch<MembershipPlan[]>('/admin/membership-plans'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron cargar los planes.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createPlan(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/admin/membership-plans', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          description: form.description || undefined,
          price: Number(form.price),
          billingFrequency: form.billingFrequency,
          trialDays: Number(form.trialDays),
          isDefault: form.isDefault,
        }),
      });
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el plan.');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleStatus(plan: MembershipPlan) {
    try {
      await apiFetch(`/admin/membership-plans/${plan.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: plan.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar el plan.');
    }
  }

  async function makeDefault(plan: MembershipPlan) {
    try {
      await apiFetch(`/admin/membership-plans/${plan.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isDefault: true }),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar el plan.');
    }
  }

  return (
    <AdminShell>
      <h1 className="bingo-page-title">Planes de Membresía</h1>
      <p className="bingo-page-subtitle">
        Catálogo que define lo que un negocio paga por presencia en el Directorio — dominio
        financiero separado del Marketplace. El plan marcado &quot;Default&quot; es el que reciben
        los negocios al aprobarse.
      </p>

      {error && (
        <div className="bingo-card" style={{ marginBottom: 16, color: 'var(--bingo-error)' }}>
          {error}
        </div>
      )}

      <div className="bingo-card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 12px' }}>Nuevo plan</h2>
        <form
          onSubmit={createPlan}
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, alignItems: 'end' }}
        >
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
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Precio (USD)</label>
            <input
              className="bingo-input"
              type="number"
              min={0}
              step="0.01"
              required
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Frecuencia</label>
            <select
              className="bingo-input"
              value={form.billingFrequency}
              onChange={(e) => setForm({ ...form, billingFrequency: e.target.value as 'MONTHLY' | 'YEARLY' })}
            >
              <option value="MONTHLY">Mensual</option>
              <option value="YEARLY">Anual</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
              Días de trial
            </label>
            <input
              className="bingo-input"
              type="number"
              min={0}
              value={form.trialDays}
              onChange={(e) => setForm({ ...form, trialDays: e.target.value })}
            />
          </div>
          <div style={{ gridColumn: 'span 3' }}>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
              Descripción (opcional)
            </label>
            <input
              className="bingo-input"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
            />
            Es el plan default
          </label>
          <button className="bingo-button" disabled={submitting} style={{ gridColumn: 'span 1' }}>
            Crear plan
          </button>
        </form>
      </div>

      <div className="bingo-card">
        {plans === null ? (
          <p>Cargando…</p>
        ) : plans.length === 0 ? (
          <p>Todavía no hay ningún plan configurado.</p>
        ) : (
          <table className="bingo-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Precio</th>
                <th>Frecuencia</th>
                <th>Trial</th>
                <th>Default</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>
                    {p.price} {p.currency}
                  </td>
                  <td>{p.billingFrequency === 'MONTHLY' ? 'Mensual' : 'Anual'}</td>
                  <td>{p.trialDays} días</td>
                  <td>{p.isDefault ? '✓' : ''}</td>
                  <td>
                    <span className={`bingo-badge badge-${p.status.toLowerCase()}`}>{p.status}</span>
                  </td>
                  <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {!p.isDefault && (
                      <button className="bingo-button secondary" onClick={() => makeDefault(p)}>
                        Hacer default
                      </button>
                    )}
                    <button
                      className={`bingo-button ${p.status === 'ACTIVE' ? 'danger' : ''}`}
                      onClick={() => toggleStatus(p)}
                    >
                      {p.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}
                    </button>
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
