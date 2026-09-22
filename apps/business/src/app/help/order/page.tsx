'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';
import EmptyState from '@/components/EmptyState';
import { apiFetch, apiFetchPage, ApiError, getActiveBusinessId } from '@/lib/api';

interface OrderSummary {
  id: string;
  orderNumber: string;
  createdAt: string;
  user: { firstName: string; lastName: string };
}

function OrderPickerContent() {
  const router = useRouter();
  const businessId = getActiveBusinessId();
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) return;
    apiFetchPage<OrderSummary>(`/me/business/${businessId}/orders?pageSize=50`)
      .then((r) => setOrders(r.data))
      .catch(() => setOrders([]));
  }, [businessId]);

  async function startChat(orderId: string) {
    if (!businessId) return;
    setBusyId(orderId);
    setError(null);
    try {
      const chat = await apiFetch<{ id: string }>('/me/support/chats', {
        method: 'POST',
        body: JSON.stringify({ submitterType: 'BUSINESS', businessId, relatedType: 'ORDER', relatedId: orderId }),
      });
      router.push(`/help/chat/${chat.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar el chat. Intenta de nuevo.');
      setBusyId(null);
    }
  }

  return (
    <>
      <button className="bingo-button secondary small" style={{ marginBottom: 16, width: 'auto' }} onClick={() => router.push('/help')}>
        ← Ayuda
      </button>
      <header className="dashboard-page-header">
        <div className="dashboard-page-title">Soporte con un pedido</div>
      </header>
      <div style={{ maxWidth: 640 }}>
        <p style={{ fontSize: 13, color: '#54617a', marginTop: 0 }}>Elige el pedido sobre el que necesitas ayuda.</p>
        {error && <div className="bingo-error-banner" style={{ marginBottom: 12 }}>{error}</div>}
        {orders === null ? (
          <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
        ) : orders.length === 0 ? (
          <EmptyState title="Aún no tienes pedidos" subtitle="Cuando tengas un pedido, podrás elegirlo aquí para pedir soporte." />
        ) : (
          orders.map((o) => (
            <button
              key={o.id}
              className="bingo-card"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 10, textAlign: 'left', border: 'none', cursor: 'pointer' }}
              disabled={busyId !== null}
              onClick={() => startChat(o.id)}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {o.user.firstName} {o.user.lastName}
                </div>
                <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 2 }}>{o.orderNumber}</div>
              </div>
              <span style={{ color: '#9aa5b1' }}>{busyId === o.id ? '…' : '→'}</span>
            </button>
          ))
        )}
      </div>
    </>
  );
}

export default function SupportOrderPickerPage() {
  return (
    <DashboardShell>
      <OrderPickerContent />
    </DashboardShell>
  );
}
