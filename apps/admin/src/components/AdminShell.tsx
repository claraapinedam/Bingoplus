'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { clearTokens, decodeRoles, getAccessToken } from '@/lib/api';

const NAV_TOP = [
  { href: '/', label: 'Inicio' },
  { href: '/analytics', label: 'Analíticas' },
  { href: '/deliveries', label: 'Delivery' },
  { href: '/customers', label: 'Clientes' },
  { href: '/services', label: 'Servicios' },
  { href: '/bookings', label: 'Reservas' },
  { href: '/promotions', label: 'Promociones' },
  { href: '/reviews', label: 'Reseñas' },
  { href: '/pet-friendly-places', label: 'Espacios Pet Friendly' },
];

const COLLAPSIBLE_MENUS = [
  {
    key: 'businesses',
    label: 'Negocios',
    matchPrefix: '/businesses',
    items: [
      { href: '/businesses/requests', label: 'Solicitudes de Negocios' },
      { href: '/businesses', label: 'Negocios' },
    ],
  },
  {
    key: 'riders',
    label: 'Riders',
    matchPrefix: '/riders',
    items: [
      { href: '/riders/requests', label: 'Solicitudes de Riders' },
      { href: '/riders', label: 'Riders' },
    ],
  },
  {
    key: 'settings',
    label: 'Configuración',
    matchPrefix: '/settings',
    items: [
      { href: '/settings', label: 'Variables' },
      { href: '/users', label: 'Usuarios' },
      { href: '/coupons', label: 'Cupones de Plataforma' },
      { href: '/membership-plans', label: 'Planes de Membresía' },
      { href: '/audit-logs', label: 'Auditoría' },
      { href: '/notifications', label: 'Notificaciones' },
    ],
  },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  // USER is a restricted admin-panel role — same login access as ADMIN/SUPER_ADMIN, but the
  // backend never grants it Analytics/Settings (see AdminAnalyticsController/
  // AdminSettingsController), so the nav shouldn't dangle links to pages it'll just get a 403
  // from. An account with USER *and* an elevated role (not a normal case, but not impossible)
  // is treated as unrestricted.
  const [restricted, setRestricted] = useState(false);

  const navTop = useMemo(() => (restricted ? NAV_TOP.filter((item) => item.href !== '/analytics') : NAV_TOP), [restricted]);
  const collapsibleMenus = useMemo(
    () =>
      restricted
        ? COLLAPSIBLE_MENUS.map((menu) =>
            menu.key === 'settings' ? { ...menu, items: menu.items.filter((item) => item.href !== '/settings') } : menu,
          )
        : COLLAPSIBLE_MENUS,
    [restricted],
  );

  const isMenuActive = (menu: (typeof COLLAPSIBLE_MENUS)[number]) =>
    (pathname?.startsWith(menu.matchPrefix) ?? false) || menu.items.some((item) => pathname?.startsWith(item.href));

  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(COLLAPSIBLE_MENUS.map((m) => [m.key, isMenuActive(m)])),
  );

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    const roles = decodeRoles(token);
    setRestricted(roles.includes('USER') && !roles.includes('ADMIN') && !roles.includes('SUPER_ADMIN'));
    setReady(true);
  }, [router]);

  useEffect(() => {
    const match = COLLAPSIBLE_MENUS.find(isMenuActive);
    if (match) setOpenMenus((prev) => ({ ...prev, [match.key]: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!ready) return null;

  return (
    <div className="bingo-shell">
      <aside className="bingo-sidebar">
        <div className="bingo-logo">
          BINGO<span className="plus">+</span>
        </div>
        {NAV_TOP.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className={`bingo-nav-link${pathname === item.href ? ' active' : ''}`}
          >
            {item.label}
          </a>
        ))}

        {COLLAPSIBLE_MENUS.map((menu) => (
          <div key={menu.key}>
            <button
              className="bingo-nav-link bingo-nav-toggle"
              onClick={() => setOpenMenus((prev) => ({ ...prev, [menu.key]: !prev[menu.key] }))}
            >
              <span>{menu.label}</span>
              <span className={`bingo-nav-chevron${openMenus[menu.key] ? ' open' : ''}`}>▾</span>
            </button>
            {openMenus[menu.key] && (
              <div className="bingo-nav-submenu">
                {menu.items.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className={`bingo-nav-link${pathname === item.href ? ' active' : ''}`}
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}

        <div style={{ flex: 1 }} />
        <button
          className="bingo-nav-link"
          style={{ background: 'transparent', border: 'none', textAlign: 'left' }}
          onClick={() => {
            clearTokens();
            router.push('/login');
          }}
        >
          Cerrar sesión
        </button>
      </aside>
      <main className="bingo-main">{children}</main>
    </div>
  );
}
