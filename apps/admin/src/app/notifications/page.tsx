'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { apiFetch } from '@/lib/api';

interface NotificationRow {
  id: string;
  event: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export default function AdminNotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationRow[] | null>(null);

  const load = useCallback(() => {
    apiFetch<NotificationRow[]>('/me/notifications').then(setNotifications).catch(() => setNotifications([]));
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
    <AdminShell>
      <h1 className="bingo-page-title">Notificaciones</h1>
      <p className="bingo-page-subtitle">{unreadCount} sin leer</p>

      {unreadCount > 0 && (
        <button className="bingo-button secondary" style={{ marginBottom: 16 }} onClick={markAllRead}>
          Marcar todo leído
        </button>
      )}

      {notifications === null ? (
        <p>Cargando…</p>
      ) : notifications.length === 0 ? (
        <div className="bingo-card">No tienes notificaciones.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 720 }}>
          {notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => openNotification(n)}
              className="bingo-card"
              style={{ textAlign: 'left', width: '100%', border: n.read ? undefined : '2px solid var(--bingo-teal)' }}
            >
              <div style={{ fontWeight: 800, fontSize: 14 }}>{n.title}</div>
              <div style={{ fontSize: 13, color: '#54617a', marginTop: 2 }}>{n.body}</div>
              <div style={{ fontSize: 11, color: '#9aa5b1', marginTop: 4 }}>{new Date(n.createdAt).toLocaleString('es-EC')}</div>
            </button>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
