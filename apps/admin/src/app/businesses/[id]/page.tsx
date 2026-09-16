'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import AdminShell from '@/components/AdminShell';
import ProductsTab from '@/components/business-tabs/ProductsTab';
import OrdersTab from '@/components/business-tabs/OrdersTab';
import CouponsTab from '@/components/business-tabs/CouponsTab';
import PaymentsTab from '@/components/business-tabs/PaymentsTab';
import CommissionsTab from '@/components/business-tabs/CommissionsTab';
import { apiFetch, ApiError } from '@/lib/api';

type CapabilityType =
  | 'SELLS_PRODUCTS'
  | 'DIRECTORY_LISTING'
  | 'SERVICES'
  | 'BOOKINGS'
  | 'PICKUP'
  | 'DELIVERY'
  | 'COUPONS';

const CAPABILITY_LABELS: Record<CapabilityType, string> = {
  SELLS_PRODUCTS: 'Vende productos (Marketplace)',
  DIRECTORY_LISTING: 'Listado en Directorio',
  SERVICES: 'Servicios',
  BOOKINGS: 'Reservas',
  PICKUP: 'Retiro en tienda',
  DELIVERY: 'Delivery',
  COUPONS: 'Cupones de negocio',
};

const CAPABILITY_ORDER: CapabilityType[] = [
  'SELLS_PRODUCTS',
  'DIRECTORY_LISTING',
  'SERVICES',
  'BOOKINGS',
  'PICKUP',
  'DELIVERY',
  'COUPONS',
];

interface Business {
  id: string;
  tradeName: string;
  legalName: string;
  email: string;
  phone: string;
  city: string;
  status: string;
  category?: { name: string };
  capabilities: Record<CapabilityType, boolean>;
}

interface MembershipPlan {
  id: string;
  name: string;
  price: string; // Prisma Decimal serializes as a string over JSON
  currency: string;
}

interface Membership {
  id: string;
  status: string;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelledAt: string | null;
  plan: MembershipPlan;
}

const MEMBERSHIP_STATUSES = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELLED', 'EXPIRED'];

const TABS = [
  { value: 'overview', label: 'Resumen' },
  { value: 'products', label: 'Productos' },
  { value: 'orders', label: 'Pedidos' },
  { value: 'coupons', label: 'Cupones' },
  { value: 'payments', label: 'Pagos' },
  { value: 'commissions', label: 'Comisiones' },
];

export default function BusinessDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') ?? 'overview';

  const [business, setBusiness] = useState<Business | null>(null);
  const [membership, setMembership] = useState<Membership | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [togglingCapability, setTogglingCapability] = useState<CapabilityType | null>(null);
  const [updatingMembership, setUpdatingMembership] = useState(false);
  const [actingOnStatus, setActingOnStatus] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [b, m] = await Promise.all([
        apiFetch<Business>(`/admin/businesses/${params.id}`),
        apiFetch<Membership | null>(`/admin/businesses/${params.id}/membership`).catch(() => null),
      ]);
      setBusiness(b);
      setMembership(m);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar el negocio.');
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  function setTab(value: string) {
    router.replace(`/businesses/${params.id}?tab=${value}`);
  }

  async function toggleCapability(capability: CapabilityType, enabled: boolean) {
    setTogglingCapability(capability);
    try {
      await apiFetch(`/admin/businesses/${params.id}/capabilities`, {
        method: 'PATCH',
        body: JSON.stringify({ capability, enabled }),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar la capacidad.');
    } finally {
      setTogglingCapability(null);
    }
  }

  async function changeMembershipStatus(status: string) {
    setUpdatingMembership(true);
    try {
      await apiFetch(`/admin/businesses/${params.id}/membership/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar la membresía.');
    } finally {
      setUpdatingMembership(false);
    }
  }

  // "Aprobar" from the admin's point of view is one action, even though it chains two backend
  // steps (approve sets the commission rate, activate makes it live in Marketplace/Directory) —
  // see admin-businesses.controller.ts. Keeping both endpoints separate on the backend (a
  // business could in principle be approved-but-not-yet-live) while presenting one button here.
  async function approveAndActivate() {
    setActingOnStatus(true);
    setError(null);
    try {
      await apiFetch(`/admin/businesses/${params.id}/approve`, { method: 'PATCH', body: JSON.stringify({}) });
      await apiFetch(`/admin/businesses/${params.id}/activate`, { method: 'PATCH', body: JSON.stringify({}) });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'La acción falló.');
    } finally {
      setActingOnStatus(false);
    }
  }

  async function runStatusAction(action: 'activate' | 'reject' | 'suspend') {
    setActingOnStatus(true);
    setError(null);
    try {
      await apiFetch(`/admin/businesses/${params.id}/${action}`, { method: 'PATCH', body: JSON.stringify({}) });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'La acción falló.');
    } finally {
      setActingOnStatus(false);
    }
  }

  if (error && !business) {
    return (
      <AdminShell>
        <div className="bingo-card" style={{ color: 'var(--bingo-error)' }}>{error}</div>
      </AdminShell>
    );
  }

  if (!business) {
    return (
      <AdminShell>
        <p>Cargando…</p>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <button
        className="bingo-button secondary"
        style={{ marginBottom: 16, padding: '8px 14px', fontSize: 13 }}
        onClick={() => router.back()}
      >
        ← Volver
      </button>

      <h1 className="bingo-page-title">{business.tradeName}</h1>
      <p className="bingo-page-subtitle">
        {business.legalName} · {business.category?.name ?? '—'} · {business.city}
        {' · '}
        <span className={`bingo-badge badge-${business.status.toLowerCase()}`}>{business.status}</span>
      </p>

      {error && (
        <div className="bingo-card" style={{ marginBottom: 16, color: 'var(--bingo-error)' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', borderBottom: '1px solid #eef1f5', paddingBottom: 14 }}>
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`bingo-button ${tab === t.value ? '' : 'secondary'}`}
            style={{ padding: '8px 14px', fontSize: 13 }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="bingo-card">
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px' }}>Solicitud / Estado</h2>
            <p style={{ fontSize: 12, color: '#7f8ea3', margin: '0 0 14px' }}>
              Aprobar fija la tasa de comisión vigente y activa el negocio en Marketplace/Directorio.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(business.status === 'PENDING' || business.status === 'UNDER_REVIEW') && (
                <>
                  <button className="bingo-button" disabled={actingOnStatus} onClick={approveAndActivate}>
                    Aprobar
                  </button>
                  <button className="bingo-button danger" disabled={actingOnStatus} onClick={() => runStatusAction('reject')}>
                    Rechazar
                  </button>
                </>
              )}
              {business.status === 'APPROVED' && (
                <button className="bingo-button" disabled={actingOnStatus} onClick={() => runStatusAction('activate')}>
                  Activar
                </button>
              )}
              {business.status === 'ACTIVE' && (
                <button className="bingo-button danger" disabled={actingOnStatus} onClick={() => runStatusAction('suspend')}>
                  Suspender
                </button>
              )}
              {business.status === 'SUSPENDED' && (
                <button className="bingo-button" disabled={actingOnStatus} onClick={() => runStatusAction('activate')}>
                  Reactivar
                </button>
              )}
              {business.status === 'REJECTED' && (
                <p style={{ fontSize: 13, color: '#7f8ea3', margin: 0 }}>Esta solicitud fue rechazada.</p>
              )}
            </div>
          </div>

          <div className="bingo-card">
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px' }}>Contacto</h2>
            <div style={{ fontSize: 13, marginBottom: 6 }}>{business.email}</div>
            <div style={{ fontSize: 13 }}>{business.phone}</div>
          </div>

          <div className="bingo-card">
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px' }}>Capacidades</h2>
            <p style={{ fontSize: 12, color: '#7f8ea3', margin: '0 0 14px' }}>
              SELLS_PRODUCTS controla elegibilidad de Marketplace (RULE 4); DIRECTORY_LISTING controla
              elegibilidad de Directorio (RULE 5). Independientes de la categoría del negocio.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {CAPABILITY_ORDER.map((cap) => {
                const enabled = business.capabilities?.[cap] ?? false;
                return (
                  <div
                    key={cap}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{CAPABILITY_LABELS[cap]}</span>
                    <button
                      className={`bingo-button ${enabled ? '' : 'secondary'}`}
                      style={{ padding: '6px 14px', fontSize: 12 }}
                      disabled={togglingCapability === cap}
                      onClick={() => toggleCapability(cap, !enabled)}
                    >
                      {enabled ? 'Activada' : 'Desactivada'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bingo-card">
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px' }}>Membresía</h2>
            <p style={{ fontSize: 12, color: '#7f8ea3', margin: '0 0 14px' }}>
              Dominio financiero separado del Marketplace — paga por visibilidad en Directorio.
            </p>
            {membership === undefined ? (
              <p style={{ fontSize: 13 }}>Cargando…</p>
            ) : membership === null ? (
              <p style={{ fontSize: 13, color: '#7f8ea3' }}>
                Este negocio no tiene membresía todavía (se crea automáticamente al aprobarlo, si hay
                un plan configurado).
              </p>
            ) : (
              <>
                <div style={{ fontSize: 13, marginBottom: 6 }}>
                  Plan: <strong>{membership.plan.name}</strong> (
                  {membership.plan.price} {membership.plan.currency})
                </div>
                <div style={{ fontSize: 13, marginBottom: 6 }}>
                  Estado:{' '}
                  <span className={`bingo-badge badge-${membership.status.toLowerCase()}`}>
                    {membership.status}
                  </span>
                </div>
                {membership.trialEndsAt && (
                  <div style={{ fontSize: 12, color: '#7f8ea3', marginBottom: 6 }}>
                    Trial termina: {new Date(membership.trialEndsAt).toLocaleDateString('es-EC')}
                  </div>
                )}
                {membership.currentPeriodEnd && (
                  <div style={{ fontSize: 12, color: '#7f8ea3', marginBottom: 6 }}>
                    Periodo actual termina: {new Date(membership.currentPeriodEnd).toLocaleDateString('es-EC')}
                  </div>
                )}

                <div style={{ marginTop: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>
                    Cambiar estado
                  </label>
                  <select
                    className="bingo-input"
                    value={membership.status}
                    disabled={updatingMembership}
                    onChange={(e) => changeMembershipStatus(e.target.value)}
                  >
                    {MEMBERSHIP_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'products' && <ProductsTab businessId={business.id} />}
      {tab === 'orders' && <OrdersTab businessId={business.id} />}
      {tab === 'coupons' && <CouponsTab businessId={business.id} />}
      {tab === 'payments' && <PaymentsTab businessId={business.id} />}
      {tab === 'commissions' && <CommissionsTab businessId={business.id} />}
    </AdminShell>
  );
}
