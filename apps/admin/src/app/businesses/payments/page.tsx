'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { apiFetch, ApiError } from '@/lib/api';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });
const percentFormatter = new Intl.NumberFormat('es-EC', { style: 'percent', minimumFractionDigits: 1 });

interface PendingBusinessRow {
  businessId: string;
  tradeName: string;
  ordersCount: number;
  gmv: number;
  commissionRate: number;
  amount: number;
}

export default function BusinessPaymentsPage() {
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<PendingBusinessRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await apiFetch<{ total: number; items: PendingBusinessRow[] }>('/admin/payouts/businesses/pending');
      setTotal(result.total);
      setItems(result.items);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar el listado de pagos a negocios.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toggle(businessId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(businessId)) next.delete(businessId);
      else next.add(businessId);
      return next;
    });
  }

  function toggleAll() {
    if (!items) return;
    setSelected((prev) => (prev.size === items.length ? new Set() : new Set(items.map((i) => i.businessId))));
  }

  async function markSelectedPaid() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await apiFetch<{ paidCount: number; totalPaid: number }>('/admin/payouts/businesses/mark-paid', {
        method: 'POST',
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      setNotice(`Se marcaron ${result.paidCount} negocio(s) como pagados por un total de ${currencyFormatter.format(result.totalPaid)}.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo marcar los pagos seleccionados como pagados.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminShell>
      <h1 className="bingo-page-title" style={{ marginBottom: 24 }}>Pagos a negocios</h1>

      <p style={{ fontSize: 13, color: '#7f8ea3', marginBottom: 16 }}>
        GMV real de pedidos pagados/completados, ya neto de la comisión vigente de cada negocio, que todavía no se
        ha liquidado. Selecciona uno o más negocios y márcalos como pagados una vez realizada la transferencia.
        Negocios sin una tasa de comisión vigente no aparecen aquí (nunca se estima un monto sin una tasa real).
      </p>

      {error && (
        <div className="bingo-card" style={{ marginBottom: 16, color: 'var(--bingo-error)' }}>
          {error}
        </div>
      )}
      {notice && (
        <div className="bingo-card" style={{ marginBottom: 16, color: 'var(--bingo-success)' }}>
          {notice}
        </div>
      )}

      <div className="bingo-card" style={{ marginBottom: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: '#7f8ea3' }}>Monto acumulado pendiente</div>
        <div style={{ fontSize: 28, fontWeight: 800 }}>{currencyFormatter.format(total)}</div>
      </div>

      <div className="bingo-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Pendientes de pago</h2>
          <button
            className="bingo-button"
            disabled={selected.size === 0 || saving}
            onClick={markSelectedPaid}
          >
            {saving ? 'Guardando…' : `Marcar como pagado (${selected.size})`}
          </button>
        </div>

        {items === null ? (
          <p>Cargando…</p>
        ) : items.length === 0 ? (
          <p style={{ fontSize: 13, color: '#7f8ea3' }}>No hay pagos pendientes a negocios.</p>
        ) : (
          <table className="bingo-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <input type="checkbox" checked={selected.size === items.length} onChange={toggleAll} />
                </th>
                <th>Negocio</th>
                <th>Pedidos</th>
                <th>GMV</th>
                <th>Comisión</th>
                <th>Monto a pagar</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.businessId}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(item.businessId)}
                      onChange={() => toggle(item.businessId)}
                    />
                  </td>
                  <td>{item.tradeName}</td>
                  <td>{item.ordersCount}</td>
                  <td>{currencyFormatter.format(item.gmv)}</td>
                  <td>{percentFormatter.format(item.commissionRate)}</td>
                  <td>{currencyFormatter.format(item.amount)}</td>
                  <td>
                    <span className="bingo-badge badge-pending">Pendiente</span>
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
