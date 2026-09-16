'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CustomerShell from '@/components/CustomerShell';
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
        <button className="bingo-button secondary small" style={{ marginBottom: 10 }} onClick={() => router.back()}>
          ← Volver
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="bingo-logo" style={{ fontSize: 18 }}>
            Notificaciones
          </div>
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
