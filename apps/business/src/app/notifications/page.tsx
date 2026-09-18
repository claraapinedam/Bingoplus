'use client';

import { useCallback, useEffect, useState } from 'react';
import DashboardShell from '@/components/DashboardShell';
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

function NotificationsContent() {
  const [notifications, setNotifications] = useState<NotificationRow[] | null>(null);

  const load = useCallback(() => {
    apiFetch<NotificationRow[]>('/me/notifications?audience=BUSINESS').then(setNotifications).catch(() => setNotifications([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markAllRead() {
    await apiFetch('/me/notifications/read-all?audience=BUSINESS', { method: 'PATCH' });
    load();
  }

  async function openNotification(n: NotificationRow) {
    if (!n.read) {
      await apiFetch(`/me/notifications/${n.id}/read?audience=BUSINESS`, { method: 'PATCH' });
      load();
    }
  }

  const unreadCount = notifications?.filter((n) => !n.read).length ?? 0;

  return (
    <>
      <header className="dashboard-page-header">
        <div>
          <div className="dashboard-page-title">Notificaciones</div>
          <div className="dashboard-page-subtitle">{unreadCount} sin leer</div>
        </div>
        {unreadCount > 0 && (
          <button className="bingo-button secondary" style={{ width: 'auto' }} onClick={markAllRead}>
            Marcar todo leído
          </button>
        )}
      </header>

      {notifications === null ? (
        <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
      ) : notifications.length === 0 ? (
        <EmptyState title="No tienes notificaciones" />
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
    </>
  );
}

export default function NotificationsPage() {
  return (
    <DashboardShell>
      <NotificationsContent />
    </DashboardShell>
  );
}
