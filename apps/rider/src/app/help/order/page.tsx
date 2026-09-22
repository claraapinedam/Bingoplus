'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import RiderShell from '@/components/RiderShell';
import EmptyState from '@/components/EmptyState';
import { apiFetch, ApiError } from '@/lib/api';

interface DeliverySummary {
  id: string;
  status: string;
  createdAt: string;
  pickupAddressSnapshot: { tradeName?: string };
  order: { orderNumber: string };
}

export default function SupportDeliveryPickerPage() {
  const router = useRouter();
  const [deliveries, setDeliveries] = useState<DeliverySummary[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<DeliverySummary[]>('/rider/deliveries').then(setDeliveries).catch(() => setDeliveries([]));
  }, []);

  async function startChat(deliveryId: string) {
    setBusyId(deliveryId);
    setError(null);
    try {
      const chat = await apiFetch<{ id: string }>('/me/support/chats', {
        method: 'POST',
        body: JSON.stringify({ submitterType: 'RIDER', relatedType: 'DELIVERY', relatedId: deliveryId }),
      });
      router.push(`/help/chat/${chat.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar el chat. Intenta de nuevo.');
      setBusyId(null);
    }
  }

  return (
    <RiderShell>
      <header className="bingo-header">
        <button className="bingo-button secondary small" style={{ marginBottom: 10 }} onClick={() => router.push('/help')}>
          ← Ayuda
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo%20para%20fondo%20osc.png" alt="BINGO+" className="bingo-logo-img" />
        <div className="bingo-header-sub" style={{ marginTop: 4 }}>Soporte con un pedido</div>
      </header>

      <div className="bingo-content">
        <p style={{ fontSize: 13, color: '#7f8ea3', marginTop: 0 }}>Elige la entrega sobre la que necesitas ayuda.</p>
        {error && <div className="bingo-error-banner" style={{ marginBottom: 12 }}>{error}</div>}
        {deliveries === null ? (
          <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
        ) : deliveries.length === 0 ? (
          <EmptyState title="Aún no tienes entregas" subtitle="Cuando tengas una entrega, podrás elegirla aquí para pedir soporte." />
        ) : (
          deliveries.map((d) => (
            <button
              key={d.id}
              className="bingo-card"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 10, textAlign: 'left', border: 'none', cursor: 'pointer' }}
              disabled={busyId !== null}
              onClick={() => startChat(d.id)}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{d.pickupAddressSnapshot.tradeName ?? 'Negocio'}</div>
                <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 2 }}>{d.order.orderNumber}</div>
              </div>
              <span style={{ color: '#9aa5b1' }}>{busyId === d.id ? '…' : '→'}</span>
            </button>
          ))
        )}
      </div>
    </RiderShell>
  );
}
