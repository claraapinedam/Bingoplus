'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CustomerShell from '@/components/CustomerShell';
import BackButton from '@/components/BackButton';
import EmptyState from '@/components/EmptyState';
import { apiFetch } from '@/lib/api';
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from '@/lib/orderStatus';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

interface OrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  total: string | number;
  currency: string;
  createdAt: string;
  business: { tradeName: string; logoUrl: string | null };
  refunds: { status: string }[];
}

// The latest Refund is the real signal once a Delivery is cancelled — Order.status has no way to
// express it (see OrderStateMachine), so it would otherwise keep reading "Listo para retirar".
function statusLabel(o: OrderSummary): { label: string; color: string } {
  const latest = o.refunds[0];
  if (latest?.status === 'PENDING') return { label: 'Por reembolsar', color: 'var(--bingo-warning, #b8860b)' };
  if (latest?.status === 'COMPLETED') return { label: 'Reembolsado', color: '#54617a' };
  return { label: ORDER_STATUS_LABELS[o.status] ?? o.status, color: ORDER_STATUS_COLORS[o.status] ?? '#54617a' };
}

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);

  useEffect(() => {
    apiFetch<OrderSummary[]>('/orders').then(setOrders).catch(() => setOrders([]));
  }, []);

  return (
    <CustomerShell>
      <header className="bingo-header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo%20para%20fondo%20osc.png" alt="BINGO+" className="bingo-logo-img" style={{ display: 'block', marginBottom: 10 }} />
        <BackButton onClick={() => router.back()} light />
        <div className="bingo-header-sub">Mis pedidos</div>
      </header>

      <div className="bingo-content">
        {orders === null ? (
          <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
        ) : orders.length === 0 ? (
          <EmptyState title="Aún no tienes pedidos" subtitle="Cuando compres algo, aparecerá aquí." />
        ) : (
          orders.map((o) => (
            <a
              key={o.id}
              href={`/orders/${o.id}`}
              className="bingo-card"
              style={{ display: 'block', marginBottom: 10 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{o.business.tradeName}</div>
                  <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 2 }}>{o.orderNumber}</div>
                  <div style={{ fontSize: 11, color: '#9aa5b1', marginTop: 2 }}>
                    {new Date(o.createdAt).toLocaleDateString('es-EC', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{currencyFormatter.format(Number(o.total))}</div>
                  <span
                    className="bingo-badge"
                    style={{ marginTop: 4, background: '#f2f4f7', color: statusLabel(o).color }}
                  >
                    {statusLabel(o).label}
                  </span>
                </div>
              </div>
            </a>
          ))
        )}
      </div>
    </CustomerShell>
  );
}
