'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminShell from '@/components/AdminShell';
import BackButton from '@/components/BackButton';
import { apiFetch, ApiError } from '@/lib/api';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });
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

interface PendingBooking {
  id: string;
  serviceName: string;
  price: number;
  tax: number;
  // Informational only — withheld by BINGO+, never part of `amount`.
  serviceFee: number;
  amount: number;
  status: string;
  createdAt: string;
}

interface PaidBookingPayout {
  id: string;
  amount: number;
  paidAt: string;
  referenceNumber: string | null;
  bookingsCount: number;
}

// A unified row shape so a single table can render both a Product order and a Service booking
// side by side, distinguished only by a "Tipo" column — a business that's Tienda AND Directorio
// (or only one of the two) sees exactly one Pendiente view and one Pagado view either way, instead
// of separate tabs whose other pair sits permanently empty for a business that only does one.
interface PendingRow {
  id: string;
  type: 'order' | 'booking';
  label: string;
  createdAt: string;
  amount: number;
  status: string;
}

interface PaidRow {
  id: string;
  type: 'order' | 'booking';
  amount: number;
  paidAt: string;
  referenceNumber: string | null;
  itemsCount: number;
}

export default function BusinessPaymentDetailPage() {
  const params = useParams<{ businessId: string }>();
  const router = useRouter();
  const [business, setBusiness] = useState<BusinessHeader | null>(null);
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [pending, setPending] = useState<{ total: number; hasCommissionRate: boolean; items: PendingOrder[] } | null>(null);
  const [history, setHistory] = useState<PaidPayout[] | null>(null);
  const [bookingsPending, setBookingsPending] = useState<{ total: number; items: PendingBooking[] } | null>(null);
  const [bookingsHistory, setBookingsHistory] = useState<PaidBookingPayout[] | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [selectedBookings, setSelectedBookings] = useState<Set<string>>(new Set());
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
      setSelectedOrders(new Set());
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

  const loadBookingsPending = useCallback(async () => {
    try {
      const result = await apiFetch<{ total: number; items: PendingBooking[] }>(
        `/admin/payouts/business-bookings/${params.businessId}/pending`,
      );
      setBookingsPending(result);
      setSelectedBookings(new Set());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar lo pendiente de pago de reservas.');
    }
  }, [params.businessId]);

  const loadBookingsHistory = useCallback(async () => {
    try {
      setBookingsHistory(await apiFetch<PaidBookingPayout[]>(`/admin/payouts/business-bookings/${params.businessId}/history`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar el historial de pagos de reservas.');
    }
  }, [params.businessId]);

  useEffect(() => {
    apiFetch<BusinessHeader>(`/admin/businesses/${params.businessId}`)
      .then(setBusiness)
      .catch(() => setBusiness(null));
    loadPending();
    loadHistory();
    loadBookingsPending();
    loadBookingsHistory();
  }, [params.businessId, loadPending, loadHistory, loadBookingsPending, loadBookingsHistory]);

  const pendingRows = useMemo((): PendingRow[] => {
    const orderRows: PendingRow[] = (pending?.items ?? []).map((o) => ({
      id: o.id,
      type: 'order',
      label: o.orderNumber,
      createdAt: o.createdAt,
      amount: o.amount,
      status: o.status,
    }));
    const bookingRows: PendingRow[] = (bookingsPending?.items ?? []).map((b) => ({
      id: b.id,
      type: 'booking',
      label: b.serviceName,
      createdAt: b.createdAt,
      amount: b.amount,
      status: b.status,
    }));
    return [...orderRows, ...bookingRows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [pending, bookingsPending]);

  const pendingTotal = (pending?.total ?? 0) + (bookingsPending?.total ?? 0);
  const selectedCount = selectedOrders.size + selectedBookings.size;

  const paidRows = useMemo((): PaidRow[] => {
    const orderRows: PaidRow[] = (history ?? []).map((p) => ({
      id: p.id,
      type: 'order',
      amount: p.amount,
      paidAt: p.paidAt,
      referenceNumber: p.referenceNumber,
      itemsCount: p.ordersCount,
    }));
    const bookingRows: PaidRow[] = (bookingsHistory ?? []).map((p) => ({
      id: p.id,
      type: 'booking',
      amount: p.amount,
      paidAt: p.paidAt,
      referenceNumber: p.referenceNumber,
      itemsCount: p.bookingsCount,
    }));
    return [...orderRows, ...bookingRows].sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
  }, [history, bookingsHistory]);

  function toggleRow(row: PendingRow) {
    if (row.type === 'order') {
      setSelectedOrders((prev) => {
        const next = new Set(prev);
        if (next.has(row.id)) next.delete(row.id);
        else next.add(row.id);
        return next;
      });
    } else {
      setSelectedBookings((prev) => {
        const next = new Set(prev);
        if (next.has(row.id)) next.delete(row.id);
        else next.add(row.id);
        return next;
      });
    }
  }

  function toggleAll() {
    const allSelected = selectedCount === pendingRows.length && pendingRows.length > 0;
    if (allSelected) {
      setSelectedOrders(new Set());
      setSelectedBookings(new Set());
    } else {
      setSelectedOrders(new Set(pendingRows.filter((r) => r.type === 'order').map((r) => r.id)));
      setSelectedBookings(new Set(pendingRows.filter((r) => r.type === 'booking').map((r) => r.id)));
    }
  }

  // Orders and Bookings settle through separate backend actions (each stamps payoutId on its own
  // row type only — see PayoutsService) even though this page now presents them as one selection.
  // A mixed selection simply fires both calls with the same reference number.
  async function markSelectedPaid() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const [orderResult, bookingResult] = await Promise.all([
        selectedOrders.size > 0
          ? apiFetch<{ amount: number }>(`/admin/payouts/businesses/${params.businessId}/mark-paid`, {
              method: 'POST',
              body: JSON.stringify({ ids: Array.from(selectedOrders), referenceNumber: referenceNumber || undefined }),
            })
          : null,
        selectedBookings.size > 0
          ? apiFetch<{ amount: number }>(`/admin/payouts/business-bookings/${params.businessId}/mark-paid`, {
              method: 'POST',
              body: JSON.stringify({ ids: Array.from(selectedBookings), referenceNumber: referenceNumber || undefined }),
            })
          : null,
      ]);
      const totalPaid = (orderResult?.amount ?? 0) + (bookingResult?.amount ?? 0);
      setNotice(`Se marcaron ${currencyFormatter.format(totalPaid)} como pagados.`);
      setReferenceNumber('');
      await Promise.all([loadPending(), loadHistory(), loadBookingsPending(), loadBookingsHistory()]);
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
      // Both histories share the same reference-update endpoint (a Payout id is a Payout id
      // regardless of whether it covers orders or bookings) — refresh both rather than tracking
      // which one this edit came from.
      await Promise.all([loadHistory(), loadBookingsHistory()]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el número de referencia.');
    } finally {
      setSaving(false);
    }
  }

  const hasSelectedOrders = selectedOrders.size > 0;
  const blockedByMissingRate = hasSelectedOrders && pending != null && !pending.hasCommissionRate;

  return (
    <AdminShell>
      <BackButton onClick={() => router.push('/businesses/payments')} />
      <h1 className="bingo-page-title" style={{ marginBottom: 20 }}>{business?.tradeName ?? 'Negocio'}</h1>

      {error && <div className="bingo-card" style={{ marginBottom: 16, color: 'var(--bingo-error)' }}>{error}</div>}
      {notice && <div className="bingo-card" style={{ marginBottom: 16, color: 'var(--bingo-success)' }}>{notice}</div>}

      {pending && !pending.hasCommissionRate && pending.items.length > 0 && (
        <div className="bingo-card" style={{ marginBottom: 16, color: 'var(--bingo-error)' }}>
          Este negocio no tiene una tasa de comisión vigente configurada — no se puede calcular ni pagar sus pedidos
          de productos hasta que se le asigne una. Las reservas de servicios no requieren comisión y pueden pagarse
          igual.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className={`bingo-button ${tab === 'pending' ? '' : 'secondary'}`} style={{ width: 'auto' }} onClick={() => setTab('pending')}>
          Pendiente {pendingRows.length > 0 ? `(${currencyFormatter.format(pendingTotal)})` : ''}
        </button>
        <button className={`bingo-button ${tab === 'history' ? '' : 'secondary'}`} style={{ width: 'auto' }} onClick={() => setTab('history')}>
          Pagado
        </button>
      </div>

      {tab === 'pending' && (
        <div className="bingo-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Pendiente de pago — {currencyFormatter.format(pendingTotal)}</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="bingo-input"
                placeholder="N.º de referencia (opcional)"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                style={{ width: 220 }}
              />
              <button className="bingo-button" disabled={selectedCount === 0 || saving || blockedByMissingRate} onClick={markSelectedPaid}>
                {saving ? 'Guardando…' : `Marcar como pagado (${selectedCount})`}
              </button>
            </div>
          </div>

          {pending === null || bookingsPending === null ? (
            <p>Cargando…</p>
          ) : pendingRows.length === 0 ? (
            <p style={{ fontSize: 13, color: '#7f8ea3' }}>Sin pedidos ni reservas pendientes de pago.</p>
          ) : (
            <table className="bingo-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}>
                    <input type="checkbox" checked={selectedCount === pendingRows.length} onChange={toggleAll} />
                  </th>
                  <th>Tipo</th>
                  <th>Referencia</th>
                  <th>Fecha</th>
                  <th>Monto a pagar</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {pendingRows.map((row) => (
                  <tr key={`${row.type}-${row.id}`}>
                    <td>
                      <input
                        type="checkbox"
                        checked={row.type === 'order' ? selectedOrders.has(row.id) : selectedBookings.has(row.id)}
                        onChange={() => toggleRow(row)}
                      />
                    </td>
                    <td>
                      <span className="bingo-badge" style={{ background: row.type === 'order' ? '#e8f7f2' : '#fff3ea' }}>
                        {row.type === 'order' ? 'Producto' : 'Reserva'}
                      </span>
                    </td>
                    <td>{row.label}</td>
                    <td>{dateFormatter.format(new Date(row.createdAt))}</td>
                    <td style={{ fontWeight: 700 }}>{currencyFormatter.format(row.amount)}</td>
                    <td>{row.status}</td>
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
          {history === null || bookingsHistory === null ? (
            <p>Cargando…</p>
          ) : paidRows.length === 0 ? (
            <p style={{ fontSize: 13, color: '#7f8ea3' }}>Todavía no se le ha pagado a este negocio.</p>
          ) : (
            <table className="bingo-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Fecha de pago</th>
                  <th>Elementos cubiertos</th>
                  <th>Monto</th>
                  <th>N.º de referencia</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {paidRows.map((p) => (
                  <tr key={`${p.type}-${p.id}`}>
                    <td>
                      <span className="bingo-badge" style={{ background: p.type === 'order' ? '#e8f7f2' : '#fff3ea' }}>
                        {p.type === 'order' ? 'Producto' : 'Reserva'}
                      </span>
                    </td>
                    <td>{dateFormatter.format(new Date(p.paidAt))}</td>
                    <td>{p.itemsCount}</td>
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
