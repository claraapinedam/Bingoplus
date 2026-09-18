'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { apiFetch, decodeRoles, getAccessToken } from '@/lib/api';

const NAV_ITEMS = [
  { href: '/', label: 'Inicio', icon: '🏠' },
  { href: '/history', label: 'Historial', icon: '📦' },
  { href: '/earnings', label: 'Ganancias', icon: '💰' },
  { href: '/notifications', label: 'Avisos', icon: '🔔' },
  { href: '/profile', label: 'Perfil', icon: '👤' },
];

/**
 * Route protection mirrors apps/customer's CustomerShell exactly (redirect to /login if no
 * token), plus one extra check the spec calls out explicitly: a Customer or Business account
 * must never reach Rider screens. Holding a valid token isn't enough — the token's `roles` must
 * include RIDER, or the user is sent to /apply (request the RIDER role) instead. The backend
 * still re-checks this on every request (RolesGuard) — this is UX routing, not the real gate.
 */
export default function RiderShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    if (!decodeRoles(token).includes('RIDER') && pathname !== '/apply') {
      router.replace('/apply');
      return;
    }
    setReady(true);
    apiFetch<number>('/me/notifications/unread-count?audience=RIDER').then(setUnreadNotifications).catch(() => undefined);
  }, [router, pathname]);

  // Approved-but-not-yet-signed riders never reach the rest of the app — same redirect pattern
  // as DashboardShell (Business) → /contract, just gated on accountStatus instead of Business.status.
  useEffect(() => {
    if (!ready || pathname === '/contract') return;
    apiFetch<{ accountStatus: string }>('/rider/profile')
      .then((profile) => {
        if (profile.accountStatus === 'APPROVED') router.replace('/contract');
      })
      .catch(() => undefined);
  }, [ready, pathname, router]);

  if (!ready) return null;

  return (
    <>
      {children}
      <nav className="bingo-bottom-nav">
        {NAV_ITEMS.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className={`bingo-nav-item${
              pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href)) ? ' active' : ''
            }`}
          >
            <span style={{ fontSize: 18 }}>{item.icon}</span>
            {item.label}
            {item.href === '/notifications' && unreadNotifications > 0 && (
              <span className="bingo-nav-badge">{unreadNotifications}</span>
            )}
          </a>
        ))}
      </nav>
    </>
  );
}
