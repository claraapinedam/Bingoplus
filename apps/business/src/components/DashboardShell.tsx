'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { apiFetch, clearTokens, getAccessToken, getActiveBusinessId } from '@/lib/api';
import { getBusinessProfile, BusinessProfile, CapabilityMap } from '@/lib/business';

interface BusinessContextValue {
  business: BusinessProfile;
  reload: () => void;
}

const BusinessContext = createContext<BusinessContextValue | null>(null);

/** Every capability-gated page reads its own capability from this instead of re-fetching the
 * business profile — the fetch happens once, here, in the shell that wraps every real page. */
export function useBusiness() {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error('useBusiness() must be called within DashboardShell');
  return ctx;
}

interface NavItem {
  href: string;
  label: string;
  icon: string;
  requires?: (keyof CapabilityMap)[];
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Inicio', icon: '🏠' },
  { href: '/orders', label: 'Pedidos', icon: '🧾' },
  { href: '/products', label: 'Productos', icon: '📦', requires: ['SELLS_PRODUCTS'] },
  { href: '/inventory', label: 'Inventario', icon: '📊', requires: ['SELLS_PRODUCTS'] },
  { href: '/services', label: 'Servicios', icon: '🛠️', requires: ['SERVICES'] },
  { href: '/bookings', label: 'Reservas', icon: '📅', requires: ['BOOKINGS'] },
  // Delivery is a product-fulfillment option — meaningless without SELLS_PRODUCTS, same reasoning
  // as Settings hiding the PICKUP/DELIVERY toggles until then.
  { href: '/delivery', label: 'Delivery', icon: '🛵', requires: ['SELLS_PRODUCTS', 'DELIVERY'] },
  { href: '/coupons', label: 'Cupones', icon: '🏷️', requires: ['COUPONS'] },
  { href: '/promotions', label: 'Promociones', icon: '🎯' },
  { href: '/reviews', label: 'Reseñas', icon: '⭐' },
  { href: '/analytics', label: 'Analíticas', icon: '📈' },
  { href: '/notifications', label: 'Notificaciones', icon: '🔔' },
  { href: '/membership', label: 'Membresía', icon: '💳' },
  { href: '/profile', label: 'Perfil del negocio', icon: '🏪' },
  { href: '/settings', label: 'Configuración', icon: '⚙️' },
  { href: '/help', label: 'Ayuda', icon: '❓' },
];

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const businessId = getActiveBusinessId();
  const [business, setBusiness] = useState<BusinessProfile | null | undefined>(undefined);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const load = () => {
    if (!businessId) return;
    getBusinessProfile(businessId).then(setBusiness).catch(() => setBusiness(null));
  };

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    if (!businessId) {
      router.replace('/select-business');
      return;
    }
    load();
    apiFetch<number>('/me/notifications/unread-count').then(setUnreadNotifications).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, pathname]);

  function logout() {
    clearTokens();
    router.push('/login');
  }

  if (business === undefined) {
    return (
      <div className="dashboard-shell">
        <div className="dashboard-main">
          <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
        </div>
      </div>
    );
  }
  if (business === null) {
    return (
      <div className="dashboard-shell">
        <div className="dashboard-main">
          <div className="bingo-error-banner">No se pudo cargar tu negocio. Intenta iniciar sesión de nuevo.</div>
          <button className="bingo-button secondary small" style={{ marginTop: 12, width: 'auto' }} onClick={logout}>
            Salir
          </button>
        </div>
      </div>
    );
  }

  return (
    <BusinessContext.Provider value={{ business, reload: load }}>
      <div className="dashboard-shell">
        <aside className="dashboard-sidebar">
          <div className="dashboard-sidebar-header">
            <div className="bingo-logo" style={{ fontSize: 18 }}>
              BINGO<span className="plus" style={{ color: 'var(--bingo-teal)' }}>+</span>
            </div>
            <div className="dashboard-sidebar-business">{business.tradeName}</div>
          </div>
          <nav className="dashboard-nav">
            {NAV_ITEMS.filter((item) => !item.requires || item.requires.every((cap) => business.capabilities[cap])).map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={`dashboard-nav-item${pathname === item.href ? ' active' : ''}`}
              >
                <span className="dashboard-nav-icon">{item.icon}</span>
                {item.label}
                {item.href === '/notifications' && unreadNotifications > 0 && (
                  <span
                    className="bingo-badge"
                    style={{ marginLeft: 'auto', background: 'var(--bingo-coral)', color: 'white' }}
                  >
                    {unreadNotifications}
                  </span>
                )}
              </a>
            ))}
          </nav>
          <div className="dashboard-sidebar-footer">
            <a href="/select-business" className="dashboard-nav-item">
              <span className="dashboard-nav-icon">🔁</span>
              Cambiar negocio
            </a>
            <button
              onClick={logout}
              className="dashboard-nav-item"
              style={{ background: 'none', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left' }}
            >
              <span className="dashboard-nav-icon">🚪</span>
              Salir
            </button>
          </div>
        </aside>
        <main className="dashboard-main">{children}</main>
      </div>
    </BusinessContext.Provider>
  );
}
