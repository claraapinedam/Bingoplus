'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { apiFetch, clearTokens, getAccessToken, getActiveBusinessId } from '@/lib/api';
import { getBusinessProfile, getBusinessContract, BusinessContract, BusinessProfile, CapabilityMap } from '@/lib/business';

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
  const [pendingContract, setPendingContract] = useState<BusinessContract | null>(null);

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
    apiFetch<number>('/me/notifications/unread-count?audience=BUSINESS').then(setUnreadNotifications).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, pathname]);

  // Approved-but-not-yet-signed businesses never reach the dashboard itself — same redirect
  // pattern as RiderShell→/apply and CustomerShell→/verify-email, just gated on Business.status
  // instead of a role or a verification flag.
  useEffect(() => {
    if (business?.status === 'APPROVED' && pathname !== '/contract') {
      router.replace('/contract');
    }
  }, [business, pathname, router]);

  // An already-ACTIVE business can still have a newer, capability-expansion contract waiting on a
  // signature (e.g. Admin enabled Directory on a Tienda-only business) — unlike the first-contract
  // case above, this never blocks the dashboard, just surfaces a banner (see the AskUserQuestion
  // decision: only the new capability stays gated, everything already working keeps working).
  useEffect(() => {
    if (business?.status !== 'ACTIVE' || !businessId) {
      setPendingContract(null);
      return;
    }
    getBusinessContract(businessId)
      .then((c) => setPendingContract(c?.status === 'PENDING_SIGNATURE' ? c : null))
      .catch(() => setPendingContract(null));
  }, [business, businessId]);

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
  // Every dead-end screen below always offers "Cambiar negocio" — the caller may own other
  // businesses (or want to create a new one), and got here either by clicking this one from
  // /select-business or because it was still the last-active business stored locally. Without
  // this, "Salir" (full logout) was the only way out, which was the actual bug being reported.
  const actions = (
    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
      <a href="/select-business" className="bingo-button secondary small" style={{ width: 'auto' }}>
        Cambiar negocio
      </a>
      <button className="bingo-button secondary small" style={{ width: 'auto' }} onClick={logout}>
        Salir
      </button>
    </div>
  );

  if (business === null) {
    return (
      <div className="dashboard-shell">
        <div className="dashboard-main">
          <div className="bingo-error-banner">No se pudo cargar tu negocio. Intenta iniciar sesión de nuevo.</div>
          {actions}
        </div>
      </div>
    );
  }
  if (business.status === 'APPROVED' && pathname !== '/contract') {
    return null;
  }
  // Everything except APPROVED (handled above, redirects to /contract) and ACTIVE is a dead end —
  // no nav, no children, nothing operational reachable. This is the actual UX half of the fix;
  // the real enforcement is BusinessActiveGuard on the backend (this alone was only ever
  // cosmetic — a direct API call could always bypass a frontend-only gate).
  if (business.status === 'PENDING' || business.status === 'UNDER_REVIEW') {
    return (
      <div className="dashboard-shell">
        <div className="dashboard-main">
          <div className="bingo-card">
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 8px' }}>Tu solicitud está en revisión</h2>
            <p style={{ fontSize: 13, color: '#7f8ea3', margin: 0 }}>
              El equipo de BINGO+ está revisando tu negocio. Te avisaremos cuando esté aprobado — ahí podrás
              firmar el contrato y empezar a operar.
            </p>
          </div>
          {actions}
        </div>
      </div>
    );
  }
  if (business.status === 'REJECTED') {
    return (
      <div className="dashboard-shell">
        <div className="dashboard-main">
          <div className="bingo-error-banner">Esta solicitud de negocio fue rechazada.</div>
          {actions}
        </div>
      </div>
    );
  }
  if (business.status === 'SUSPENDED') {
    return (
      <div className="dashboard-shell">
        <div className="dashboard-main">
          <div className="bingo-error-banner">Este negocio está suspendido. Contacta a soporte de BINGO+ para más información.</div>
          {actions}
        </div>
      </div>
    );
  }

  return (
    <BusinessContext.Provider value={{ business, reload: load }}>
      <div className="dashboard-shell">
        <aside className="dashboard-sidebar">
          <div className="dashboard-sidebar-header">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo%20para%20fondo%20osc.png" alt="BINGO+" className="bingo-logo-img" />
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
        <main className="dashboard-main">
          {pendingContract && pathname !== '/contract' && (
            <div
              className="bingo-card"
              style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, background: '#fff8e6' }}
            >
              <span style={{ fontSize: 13 }}>
                Tienes un contrato actualizado pendiente de firma para activar una capacidad nueva. Lo que ya
                tienes activo sigue funcionando normalmente.
              </span>
              <a href="/contract" className="bingo-button secondary small" style={{ width: 'auto', whiteSpace: 'nowrap' }}>
                Ver contrato
              </a>
            </div>
          )}
          {children}
        </main>
      </div>
    </BusinessContext.Provider>
  );
}
