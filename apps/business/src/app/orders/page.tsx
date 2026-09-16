'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';
import EmptyState from '@/components/EmptyState';
import { apiFetchPage, getActiveBusinessId } from '@/lib/api';
import { connectSocket } from '@/lib/socket';
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS, STATUS_TABS } from '@/lib/orderStatus';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

interface OrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  fulfillmentType: 'PICKUP' | 'DELIVERY';
  total: string | number;
  createdAt: string;
  items: { id: string; quantity: number }[];
  user: { firstName: string; lastName: string };
  payment: { status: string } | null;
}

type SortKey = 'createdAt' | 'total';

function OrdersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const businessId = getActiveBusinessId();
  const [status, setStatus] = useState(searchParams.get('status') ?? '');
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const load = useCallback(() => {
    if (!businessId) return;
    const query = status ? `?status=${status}&pageSize=100` : '?pageSize=100';
    apiFetchPage<OrderSummary>(`/me/business/${businessId}/orders${query}`)
      .then((r) => {
        setOrders(r.data);
        setTotal(r.meta.total);
      })
      .catch(() => setOrders([]));
  }, [businessId, status]);

  useEffect(() => {
    load();
  }, [load]);

  // No dedicated "order created" WebSocket event exists yet — new PAID orders appear on the next
  // load/manual refresh. Once an order has a Delivery, its live progress does push via the
  // existing delivery:{id} room (see Order Detail).
  useEffect(() => {
    connectSocket();
  }, []);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const visible = useMemo(() => {
    if (!orders) return [];
    const term = search.trim().toLowerCase();
    const filtered = term
      ? orders.filter(
          (o) =>
            o.orderNumber.toLowerCase().includes(term) ||
            `${o.user.firstName} ${o.user.lastName}`.toLowerCase().includes(term),
        )
      : orders;
    const sorted = [...filtered].sort((a, b) => {
      const av = sortKey === 'total' ? Number(a.total) : new Date(a.createdAt).getTime();
      const bv = sortKey === 'total' ? Number(b.total) : new Date(b.createdAt).getTime();
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return sorted;
  }, [orders, search, sortKey, sortDir]);

  return (
    <>
      <header className="dashboard-page-header">
        <div>
          <div className="dashboard-page-title">Pedidos</div>
          <div className="dashboard-page-subtitle">{total} pedido(s) en este filtro</div>
        </div>
      </header>

      <div className="bingo-chip-row" style={{ marginBottom: 12 }}>
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            className={`bingo-chip${status === tab.value ? ' active' : ''}`}
            onClick={() => setStatus(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="dashboard-toolbar">
        <input
          className="bingo-input dashboard-search"
          placeholder="Buscar por # de pedido o cliente…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {orders === null ? (
        <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
      ) : visible.length === 0 ? (
        <EmptyState title="No hay pedidos en este filtro" />
      ) : (
        <div className="dashboard-table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Cliente</th>
                <th className={sortKey === 'createdAt' ? 'sorted' : ''} onClick={() => toggleSort('createdAt')}>
                  Fecha {sortKey === 'createdAt' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th>Tipo</th>
                <th className={sortKey === 'total' ? 'sorted' : ''} onClick={() => toggleSort('total')}>
                  Total {sortKey === 'total' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((o) => (
                <tr key={o.id} onClick={() => router.push(`/orders/${o.id}`)}>
                  <td style={{ fontWeight: 700 }}>{o.orderNumber}</td>
                  <td>
                    {o.user.firstName} {o.user.lastName}
                  </td>
                  <td>
                    {new Date(o.createdAt).toLocaleString('es-EC', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td>{o.fulfillmentType === 'PICKUP' ? 'Retiro' : 'Entrega'}</td>
                  <td style={{ fontWeight: 700 }}>{currencyFormatter.format(Number(o.total))}</td>
                  <td>
                    <span className="bingo-badge" style={{ background: '#f2f4f7', color: ORDER_STATUS_COLORS[o.status] ?? '#54617a' }}>
                      {ORDER_STATUS_LABELS[o.status] ?? o.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function OrdersPage() {
  return (
    <DashboardShell>
      <Suspense fallback={null}>
        <OrdersContent />
      </Suspense>
    </DashboardShell>
  );
}
