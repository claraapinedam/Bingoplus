'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { apiFetch, ApiError } from '@/lib/api';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

interface PendingRiderRow {
  riderId: string;
  riderName: string;
  riderEmail: string | null;
  earningsCount: number;
  amount: number;
}

export default function RiderPaymentsPage() {
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<PendingRiderRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await apiFetch<{ total: number; items: PendingRiderRow[] }>('/admin/payouts/riders/pending');
      setTotal(result.total);
      setItems(result.items);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar el listado de pagos a riders.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toggle(riderId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(riderId)) next.delete(riderId);
      else next.add(riderId);
      return next;
    });
  }

  function toggleAll() {
    if (!items) return;
    setSelected((prev) => (prev.size === items.length ? new Set() : new Set(items.map((i) => i.riderId))));
  }

  async function markSelectedPaid() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await apiFetch<{ paidCount: number; totalPaid: number }>('/admin/payouts/riders/mark-paid', {
        method: 'POST',
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      setNotice(`Se marcaron ${result.paidCount} rider(es) como pagados por un total de ${currencyFormatter.format(result.totalPaid)}.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo marcar los pagos seleccionados como pagados.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminShell>
      <h1 className="bingo-page-title" style={{ marginBottom: 24 }}>Pagos a riders</h1>

      <p style={{ fontSize: 13, color: '#7f8ea3', marginBottom: 16 }}>
        Ganancias netas de comisión y retención de impuesto (RiderEarning) que todavía no se han pagado a cada
        rider. Selecciona uno o más riders y márcalos como pagados una vez que la transferencia se haya realizado.
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
          <p style={{ fontSize: 13, color: '#7f8ea3' }}>No hay pagos pendientes a riders.</p>
        ) : (
          <table className="bingo-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <input type="checkbox" checked={selected.size === items.length} onChange={toggleAll} />
                </th>
                <th>Rider</th>
                <th>Entregas</th>
                <th>Monto neto</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.riderId}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(item.riderId)}
                      onChange={() => toggle(item.riderId)}
                    />
                  </td>
                  <td>
                    {item.riderName}
                    {item.riderEmail && (
                      <>
                        <br />
                        <span style={{ color: '#7f8ea3', fontSize: 12 }}>{item.riderEmail}</span>
                      </>
                    )}
                  </td>
                  <td>{item.earningsCount}</td>
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
