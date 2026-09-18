'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CustomerShell from '@/components/CustomerShell';
import BackButton from '@/components/BackButton';
import EmptyState from '@/components/EmptyState';
import { apiFetch } from '@/lib/api';

interface NotificationRow {
  id: string;
  event: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationRow[] | null>(null);

  const load = useCallback(() => {
    apiFetch<NotificationRow[]>('/me/notifications')
      .then(setNotifications)
      .catch(() => setNotifications([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markAllRead() {
    await apiFetch('/me/notifications/read-all', { method: 'PATCH' });
    load();
  }

  async function openNotification(n: NotificationRow) {
    if (!n.read) {
      await apiFetch(`/me/notifications/${n.id}/read`, { method: 'PATCH' });
      load();
    }
  }

  const unreadCount = notifications?.filter((n) => !n.read).length ?? 0;

  return (
    <CustomerShell>
      <header className="bingo-header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo%20para%20fondo%20osc.png" alt="BINGO+" className="bingo-logo-img" style={{ display: 'block', marginBottom: 10 }} />
        <BackButton onClick={() => router.back()} light />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
          <div className="bingo-header-sub" style={{ margin: 0 }}>Notificaciones</div>
          {unreadCount > 0 && (
            <button className="bingo-button secondary small" onClick={markAllRead}>
              Marcar todo leído
            </button>
          )}
        </div>
      </header>

      <div className="bingo-content">
        {notifications === null ? (
          <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
        ) : notifications.length === 0 ? (
          <EmptyState title="No tienes notificaciones" />
        ) : (
          notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => openNotification(n)}
              className="bingo-card"
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                marginBottom: 8,
                border: n.read ? undefined : '2px solid var(--bingo-teal)',
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 14 }}>{n.title}</div>
              <div style={{ fontSize: 13, color: '#54617a', marginTop: 2 }}>{n.body}</div>
              <div style={{ fontSize: 11, color: '#9aa5b1', marginTop: 4 }}>
                {new Date(n.createdAt).toLocaleString('es-EC', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </div>
            </button>
          ))
        )}
      </div>
    </CustomerShell>
  );
}
