'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CustomerShell from '@/components/CustomerShell';
import BackButton from '@/components/BackButton';
import EmptyState from '@/components/EmptyState';
import { apiFetch, ApiError } from '@/lib/api';

interface OrderSummary {
  id: string;
  orderNumber: string;
  createdAt: string;
  business: { tradeName: string };
}

export default function SupportOrderPickerPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<OrderSummary[]>('/orders').then(setOrders).catch(() => setOrders([]));
  }, []);

  async function startChat(orderId: string) {
    setBusyId(orderId);
    setError(null);
    try {
      const chat = await apiFetch<{ id: string }>('/me/support/chats', {
        method: 'POST',
        body: JSON.stringify({ submitterType: 'CUSTOMER', relatedType: 'ORDER', relatedId: orderId }),
      });
      router.push(`/help/chat/${chat.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar el chat. Intenta de nuevo.');
      setBusyId(null);
    }
  }

  return (
    <CustomerShell>
      <header className="bingo-header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo%20para%20fondo%20osc.png" alt="BINGO+" className="bingo-logo-img" style={{ display: 'block', marginBottom: 10 }} />
        <BackButton onClick={() => router.back()} light />
        <div className="bingo-header-sub">Soporte con un pedido</div>
      </header>

      <div className="bingo-content">
        <p style={{ fontSize: 13, color: '#7f8ea3', marginTop: 0 }}>Elige el pedido sobre el que necesitas ayuda.</p>
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
                <div style={{ fontWeight: 700, fontSize: 14 }}>{o.business.tradeName}</div>
                <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 2 }}>{o.orderNumber}</div>
              </div>
              <span style={{ color: '#9aa5b1' }}>{busyId === o.id ? '…' : '→'}</span>
            </button>
          ))
        )}
      </div>
    </CustomerShell>
  );
}
