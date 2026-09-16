'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import DashboardShell, { useBusiness } from '@/components/DashboardShell';
import EmptyState from '@/components/EmptyState';
import { apiFetch, apiFetchPage, ApiError, getActiveBusinessId } from '@/lib/api';

const REASON_LABELS: Record<string, string> = {
  RESTOCK: 'Reabastecimiento',
  SALE: 'Venta',
  ADJUSTMENT: 'Ajuste',
  RETURN: 'Devolución',
};

interface ProductRow {
  id: string;
  name: string;
  stock: number;
  lowStock: boolean;
}

interface Movement {
  id: string;
  quantityChange: number;
  reason: string;
  note: string | null;
  createdAt: string;
}

function AdjustPanel({ product, onDone }: { product: ProductRow; onDone: () => void }) {
  const businessId = getActiveBusinessId();
  const [quantityChange, setQuantityChange] = useState('');
  const [reason, setReason] = useState('RESTOCK');
  const [note, setNote] = useState('');
  const [movements, setMovements] = useState<Movement[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) return;
    apiFetch<Movement[]>(`/business/${businessId}/products/${product.id}/stock-movements`)
      .then((rows) => setMovements(rows.slice(0, 10)))
      .catch(() => setMovements([]));
  }, [businessId, product.id]);

  async function submit() {
    if (!businessId || !quantityChange) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/business/${businessId}/products/${product.id}/stock`, {
        method: 'PATCH',
        body: JSON.stringify({ quantityChange: Number(quantityChange), reason, note: note || undefined }),
      });
      setQuantityChange('');
      setNote('');
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo ajustar el stock.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bingo-card" style={{ marginTop: 8, marginBottom: 16 }}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Ajustar stock — {product.name}</div>
      <div className="dashboard-form-grid">
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
            Cambio (positivo para sumar, negativo para restar)
          </label>
          <input
            className="bingo-input"
            type="number"
            step="1"
            value={quantityChange}
            onChange={(e) => setQuantityChange(e.target.value)}
          />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Motivo</label>
          <select className="bingo-input" value={reason} onChange={(e) => setReason(e.target.value)}>
            {Object.entries(REASON_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Nota (opcional)</label>
        <input className="bingo-input" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {error && <div className="bingo-error-banner" style={{ marginTop: 10 }}>{error}</div>}
      <button
        className="bingo-button"
        style={{ marginTop: 10, width: 'auto' }}
        disabled={busy || !quantityChange}
        onClick={submit}
      >
        {busy ? 'Aplicando…' : 'Aplicar cambio'}
      </button>

      <div style={{ marginTop: 16, fontSize: 12, fontWeight: 700, color: '#7f8ea3' }}>Movimientos recientes</div>
      {movements === null ? (
        <p style={{ color: '#7f8ea3', fontSize: 12 }}>Cargando…</p>
      ) : movements.length === 0 ? (
        <p style={{ color: '#9aa5b1', fontSize: 12 }}>Sin movimientos todavía.</p>
      ) : (
        movements.map((m) => (
          <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderTop: '1px solid #f2f4f7' }}>
            <span>
              {REASON_LABELS[m.reason] ?? m.reason}
              {m.note ? ` — ${m.note}` : ''}
            </span>
            <span style={{ fontWeight: 700, color: m.quantityChange >= 0 ? 'var(--bingo-success)' : 'var(--bingo-error)' }}>
              {m.quantityChange >= 0 ? '+' : ''}
              {m.quantityChange}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

function InventoryContent() {
  const { business } = useBusiness();
  const businessId = getActiveBusinessId();
  const [products, setProducts] = useState<ProductRow[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!businessId) return;
    apiFetchPage<ProductRow>(`/business/${businessId}/products?pageSize=200`)
      .then((r) => setProducts(r.data))
      .catch(() => setProducts([]));
  }, [businessId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!business.capabilities.SELLS_PRODUCTS) {
    return <EmptyState title="Esta sección no está disponible" subtitle="Tu negocio no tiene habilitada la venta de productos." />;
  }

  return (
    <>
      <header className="dashboard-page-header">
        <div>
          <div className="dashboard-page-title">Inventario</div>
          <div className="dashboard-page-subtitle">Ajusta el stock desde aquí — cada cambio queda registrado.</div>
        </div>
      </header>

      {products === null ? (
        <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
      ) : products.length === 0 ? (
        <EmptyState title="No hay productos" />
      ) : (
        <div className="dashboard-table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Stock disponible</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <Fragment key={p.id}>
                  <tr onClick={() => setOpenId(openId === p.id ? null : p.id)}>
                    <td style={{ fontWeight: 700 }}>{p.name}</td>
                    <td style={p.lowStock ? { color: 'var(--bingo-warning)', fontWeight: 700 } : undefined}>{p.stock}</td>
                    <td>
                      {p.lowStock ? (
                        <span className="bingo-badge" style={{ background: '#fff4e5', color: 'var(--bingo-warning)' }}>
                          Stock bajo
                        </span>
                      ) : (
                        <span className="bingo-badge" style={{ background: '#f2f4f7', color: 'var(--bingo-success)' }}>
                          OK
                        </span>
                      )}
                    </td>
                    <td style={{ color: 'var(--bingo-teal)', fontWeight: 700 }}>{openId === p.id ? 'Cerrar' : 'Ajustar'}</td>
                  </tr>
                  {openId === p.id && (
                    <tr>
                      <td colSpan={4} style={{ padding: '0 16px 16px' }}>
                        <AdjustPanel product={p} onDone={load} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function InventoryPage() {
  return (
    <DashboardShell>
      <InventoryContent />
    </DashboardShell>
  );
}
