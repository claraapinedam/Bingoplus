'use client';

import { useEffect, useState } from 'react';
import { connectSocket } from '@/lib/socket';
import { playNewOrderChime } from '@/lib/notificationSound';

interface NewOrderAlert {
  id: string;
  orderId: string;
  orderNumber: string;
}

const AUTO_DISMISS_MS = 20000;

/**
 * Always-mounted (rendered once from DashboardShell, not per-page) listener for the
 * `business:{businessId}` Socket.IO room — see BusinessNotificationGateway on the API side. Fires
 * a synthesized chime + an on-screen banner the instant a new PAID order lands for this business,
 * regardless of which page is currently open. Purely additive to the existing DB-backed
 * Notification Center (/notifications) — this is the realtime "don't miss it" layer on top.
 */
export default function NewOrderAlerts({ businessId }: { businessId: string }) {
  const [alerts, setAlerts] = useState<NewOrderAlert[]>([]);

  useEffect(() => {
    const socket = connectSocket();
    if (!socket) return;

    socket.emit('subscribe:business', { businessId });

    const onNewOrder = (data: { orderId: string; orderNumber: string }) => {
      const alert: NewOrderAlert = { id: `${data.orderId}-${Date.now()}`, orderId: data.orderId, orderNumber: data.orderNumber };
      setAlerts((prev) => [...prev, alert]);
      playNewOrderChime();
      setTimeout(() => {
        setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
      }, AUTO_DISMISS_MS);
    };

    socket.on('order.new', onNewOrder);
    return () => {
      socket.emit('unsubscribe:business', { businessId });
      socket.off('order.new', onNewOrder);
    };
  }, [businessId]);

  function dismiss(id: string) {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  if (alerts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        maxWidth: 320,
      }}
    >
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="bingo-card"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 10,
            boxShadow: '0 8px 24px rgba(16, 24, 40, 0.18)',
            border: '1px solid var(--bingo-teal, #14b8a6)',
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>🔔 Nuevo pedido</div>
            <div style={{ fontSize: 12, color: '#54617a', marginTop: 2 }}>
              Pedido {alert.orderNumber} acaba de llegar.
            </div>
            <a
              href={`/orders/${alert.orderId}`}
              className="bingo-button small"
              style={{ marginTop: 8, width: 'auto', display: 'inline-flex' }}
              onClick={() => dismiss(alert.id)}
            >
              Ver pedido
            </a>
          </div>
          <button
            aria-label="Descartar"
            onClick={() => dismiss(alert.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#7f8ea3', lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
