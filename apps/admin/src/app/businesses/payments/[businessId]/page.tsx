'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminShell from '@/components/AdminShell';
import BackButton from '@/components/BackButton';
import { apiFetch, ApiError } from '@/lib/api';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });
const percentFormatter = new Intl.NumberFormat('es-EC', { style: 'percent', minimumFractionDigits: 1 });
const dateFormatter = new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeStyle: 'short' });

interface BusinessHeader {
  tradeName: string;
}

interface PendingOrder {
  id: string;
  orderNumber: string;
  gmv: number;
  commissionRate: number | null;
  commissionAmount: number;
  amount: number;
  status: string;
  createdAt: string;
}

interface PaidPayout {
  id: string;
  amount: number;
  paidAt: string;
  referenceNumber: string | null;
  ordersCount: number;
}

export default function BusinessPaymentDetailPage() {
  const params = useParams<{ businessId: string }>();
  const router = useRouter();
  const [business, setBusiness] = useState<BusinessHeader | null>(null);
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [pending, setPending] = useState<{ total: number; hasCommissionRate: boolean; items: PendingOrder[] } | null>(null);
  const [history, setHistory] = useState<PaidPayout[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [referenceNumber, setReferenceNumber] = useState('');
  const [editingRef, setEditingRef] = useState<{ id: string; value: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadPending = useCallback(async () => {
    try {
      const result = await apiFetch<{ total: number; hasCommissionRate: boolean; items: PendingOrder[] }>(
        `/admin/payouts/businesses/${params.businessId}/pending`,
      );
      setPending(result);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar lo pendiente de pago.');
    }
  }, [params.businessId]);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await apiFetch<PaidPayout[]>(`/admin/payouts/businesses/${params.businessId}/history`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar el historial de pagos.');
    }
  }, [params.businessId]);

  useEffect(() => {
    apiFetch<BusinessHeader>(`/admin/businesses/${params.businessId}`)
      .then(setBusiness)
      .catch(() => setBusiness(null));
    loadPending();
    loadHistory();
  }, [params.businessId, loadPending, loadHistory]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!pending) return;
    setSelected((prev) => (prev.size === pending.items.length ? new Set() : new Set(pending.items.map((i) => i.id))));
  }

  async function markSelectedPaid() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await apiFetch<{ amount: number }>(`/admin/payouts/businesses/${params.businessId}/mark-paid`, {
        method: 'POST',
        body: JSON.stringify({ ids: Array.from(selected), referenceNumber: referenceNumber || undefined }),
      });
      setNotice(`Se marcaron ${currencyFormatter.format(result.amount)} como pagados.`);
      setReferenceNumber('');
      await Promise.all([loadPending(), loadHistory()]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo marcar los pagos seleccionados como pagados.');
    } finally {
      setSaving(false);
    }
  }

  async function saveReference(payoutId: string) {
    if (!editingRef) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/admin/payouts/${payoutId}/reference`, {
        method: 'PATCH',
        body: JSON.stringify({ referenceNumber: editingRef.value }),
      });
      setEditingRef(null);
      await loadHistory();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el número de referencia.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminShell>
      <BackButton onClick={() => router.push('/businesses/payments')} />
      <h1 className="bingo-page-title" style={{ marginBottom: 20 }}>{business?.tradeName ?? 'Negocio'}</h1>

      {error && <div className="bingo-card" style={{ marginBottom: 16, color: 'var(--bingo-error)' }}>{error}</div>}
      {notice && <div className="bingo-card" style={{ marginBottom: 16, color: 'var(--bingo-success)' }}>{notice}</div>}

      {pending && !pending.hasCommissionRate && pending.items.length > 0 && (
        <div className="bingo-card" style={{ marginBottom: 16, color: 'var(--bingo-error)' }}>
          Este negocio no tiene una tasa de comisión vigente configurada — no se puede calcular ni pagar su monto hasta que se le asigne una.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          className={`bingo-button ${tab === 'pending' ? '' : 'secondary'}`}
          style={{ width: 'auto' }}
          onClick={() => setTab('pending')}
        >
          Pendiente {pending ? `(${currencyFormatter.format(pending.total)})` : ''}
        </button>
        <button
          className={`bingo-button ${tab === 'history' ? '' : 'secondary'}`}
          style={{ width: 'auto' }}
          onClick={() => setTab('history')}
        >
          Pagado
        </button>
      </div>

      {tab === 'pending' && (
        <div className="bingo-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>
              Pendiente de pago — {pending ? currencyFormatter.format(pending.total) : '—'}
            </h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="bingo-input"
                placeholder="N.º de referencia (opcional)"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                style={{ width: 220 }}
              />
              <button
                className="bingo-button"
                disabled={selected.size === 0 || saving || !pending?.hasCommissionRate}
                onClick={markSelectedPaid}
              >
                {saving ? 'Guardando…' : `Marcar como pagado (${selected.size})`}
              </button>
            </div>
          </div>

          {pending === null ? (
            <p>Cargando…</p>
          ) : pending.items.length === 0 ? (
            <p style={{ fontSize: 13, color: '#7f8ea3' }}>Sin pedidos pendientes de pago.</p>
          ) : (
            <table className="bingo-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}>
                    <input type="checkbox" checked={selected.size === pending.items.length} onChange={toggleAll} />
                  </th>
                  <th>N.º de pedido</th>
                  <th>Fecha</th>
                  <th>GMV</th>
                  <th>Comisión</th>
                  <th>Monto a pagar</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {pending.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
                    </td>
                    <td>{item.orderNumber}</td>
                    <td>{dateFormatter.format(new Date(item.createdAt))}</td>
                    <td>{currencyFormatter.format(item.gmv)}</td>
                    <td>
                      {item.commissionRate != null ? `${percentFormatter.format(item.commissionRate)} · ` : ''}
                      {currencyFormatter.format(item.commissionAmount)}
                    </td>
                    <td style={{ fontWeight: 700 }}>{currencyFormatter.format(item.amount)}</td>
                    <td>{item.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="bingo-card">
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>Historial de pagos</h2>
          {history === null ? (
            <p>Cargando…</p>
          ) : history.length === 0 ? (
            <p style={{ fontSize: 13, color: '#7f8ea3' }}>Todavía no se le ha pagado a este negocio.</p>
          ) : (
            <table className="bingo-table">
              <thead>
                <tr>
                  <th>Fecha de pago</th>
                  <th>Pedidos cubiertos</th>
                  <th>Monto</th>
                  <th>N.º de referencia</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {history.map((p) => (
                  <tr key={p.id}>
                    <td>{dateFormatter.format(new Date(p.paidAt))}</td>
                    <td>{p.ordersCount}</td>
                    <td>{currencyFormatter.format(p.amount)}</td>
                    <td>
                      {editingRef?.id === p.id ? (
                        <input
                          className="bingo-input"
                          autoFocus
                          value={editingRef.value}
                          onChange={(e) => setEditingRef({ id: p.id, value: e.target.value })}
                          style={{ width: 160 }}
                        />
                      ) : (
                        p.referenceNumber ?? <span style={{ color: '#9aa5b1' }}>—</span>
                      )}
                    </td>
                    <td>
                      {editingRef?.id === p.id ? (
                        <button className="bingo-button secondary small" disabled={saving} onClick={() => saveReference(p.id)}>
                          Guardar
                        </button>
                      ) : (
                        <button
                          className="bingo-button secondary small"
                          onClick={() => setEditingRef({ id: p.id, value: p.referenceNumber ?? '' })}
                        >
                          {p.referenceNumber ? 'Editar' : 'Añadir referencia'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </AdminShell>
  );
}
