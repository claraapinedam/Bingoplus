'use client';

import { useState } from 'react';
import DashboardShell, { useBusiness } from '@/components/DashboardShell';
import { apiFetch, ApiError, getActiveBusinessId } from '@/lib/api';
import { CapabilityMap, OPERATIONAL_CAPABILITIES } from '@/lib/business';

const CAPABILITY_LABELS: Record<keyof CapabilityMap, { label: string; hint: string }> = {
  SELLS_PRODUCTS: { label: 'Venta de productos', hint: 'Habilita Productos, Inventario y Pedidos de marketplace.' },
  DIRECTORY_LISTING: { label: 'Listado en el Directorio', hint: 'Hace visible tu perfil público en BINGO+.' },
  SERVICES: { label: 'Servicios', hint: 'Consultas, baños, paseos, etc.' },
  BOOKINGS: { label: 'Reservas', hint: 'Agenda de citas para tus servicios.' },
  PICKUP: { label: 'Retiro en tienda', hint: 'El cliente recoge su pedido en el local.' },
  DELIVERY: { label: 'Entrega a domicilio', hint: 'Envío con repartidor de BINGO+.' },
  COUPONS: { label: 'Cupones', hint: 'Crea descuentos promocionales.' },
};

const ADMIN_ONLY: (keyof CapabilityMap)[] = ['SELLS_PRODUCTS', 'DIRECTORY_LISTING'];

function SettingsContent() {
  const { business, reload } = useBusiness();
  const businessId = getActiveBusinessId();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(capability: keyof CapabilityMap, enabled: boolean) {
    if (!businessId) return;
    setBusyKey(capability);
    setError(null);
    try {
      await apiFetch(`/me/business/${businessId}/capabilities`, {
        method: 'PATCH',
        body: JSON.stringify({ capability, enabled }),
      });
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar esta función.');
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <>
      <header className="dashboard-page-header">
        <div className="dashboard-page-title">Configuración</div>
      </header>

      <h2 className="bingo-section-title" style={{ marginTop: 0 }}>
        Funciones de tu negocio
      </h2>
      {error && <div className="bingo-error-banner" style={{ marginBottom: 12, maxWidth: 640 }}>{error}</div>}
      <div className="bingo-card" style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {OPERATIONAL_CAPABILITIES
          // PICKUP/DELIVERY are fulfillment options for products — meaningless (and never
          // auto-granted at onboarding) while SELLS_PRODUCTS itself is off, so they don't even
          // appear here until it's on, instead of offering a toggle for something that can't apply.
          .filter((cap) => business.capabilities.SELLS_PRODUCTS || (cap !== 'PICKUP' && cap !== 'DELIVERY'))
          .map((cap) => (
          <div key={cap} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f2f4f7' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{CAPABILITY_LABELS[cap].label}</div>
              <div style={{ fontSize: 12, color: '#7f8ea3' }}>{CAPABILITY_LABELS[cap].hint}</div>
            </div>
            <button
              className={`bingo-chip${business.capabilities[cap] ? ' active' : ''}`}
              disabled={busyKey === cap}
              onClick={() => toggle(cap, !business.capabilities[cap])}
            >
              {business.capabilities[cap] ? 'Activado' : 'Desactivado'}
            </button>
          </div>
        ))}
      </div>

      <h2 className="bingo-section-title">Funciones administradas por BINGO+</h2>
      <div className="bingo-card" style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {ADMIN_ONLY.map((cap) => (
          <div key={cap} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f2f4f7' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{CAPABILITY_LABELS[cap].label}</div>
              <div style={{ fontSize: 12, color: '#7f8ea3' }}>{CAPABILITY_LABELS[cap].hint}</div>
            </div>
            <span className="bingo-badge" style={{ background: '#f2f4f7', color: business.capabilities[cap] ? 'var(--bingo-success)' : '#9aa5b1' }}>
              {business.capabilities[cap] ? 'Activado' : 'Desactivado'}
            </span>
          </div>
        ))}
        <div style={{ fontSize: 11, color: '#9aa5b1', marginTop: 8 }}>
          Estas funciones definen si tu negocio es elegible para el Marketplace o el Directorio — solo un administrador de BINGO+ puede cambiarlas.
        </div>
      </div>
    </>
  );
}

export default function SettingsPage() {
  return (
    <DashboardShell>
      <SettingsContent />
    </DashboardShell>
  );
}
