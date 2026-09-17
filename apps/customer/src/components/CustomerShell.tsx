'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { apiFetch, getAccessToken } from '@/lib/api';

interface CartSummary {
  items: { quantity: number }[];
}

interface Me {
  isEmailVerified: boolean;
}

const NAV_ITEMS = [
  { href: '/', label: 'Inicio', icon: '🏠' },
  { href: '/stores', label: 'Tiendas', icon: '🏪' },
  { href: '/directory', label: 'Directorio', icon: '📖' },
  { href: '/cart', label: 'Carrito', icon: '🛒' },
  { href: '/profile', label: 'Perfil', icon: '🐾' },
];

export default function CustomerShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    apiFetch<Me>('/me')
      .then((me) => {
        if (!me.isEmailVerified) {
          router.replace('/verify-email');
          return;
        }
        setReady(true);
      })
      .catch(() => undefined);
    apiFetch<CartSummary | null>('/me/cart')
      .then((cart) => setCartCount(cart?.items.reduce((n, i) => n + i.quantity, 0) ?? 0))
      .catch(() => undefined);
    apiFetch<number>('/me/notifications/unread-count')
      .then(setUnreadNotifications)
      .catch(() => undefined);
  }, [router, pathname]);

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
            {item.href === '/cart' && cartCount > 0 && (
              <span className="bingo-nav-badge">{cartCount}</span>
            )}
            {item.href === '/profile' && unreadNotifications > 0 && (
              <span className="bingo-nav-badge">{unreadNotifications}</span>
            )}
          </a>
        ))}
      </nav>
    </>
  );
}
