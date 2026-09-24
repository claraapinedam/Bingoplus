'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import AdminShell from '@/components/AdminShell';
import ProductsTab from '@/components/business-tabs/ProductsTab';
import OrdersTab from '@/components/business-tabs/OrdersTab';
import CouponsTab from '@/components/business-tabs/CouponsTab';
import PaymentsTab from '@/components/business-tabs/PaymentsTab';
import CommissionsTab from '@/components/business-tabs/CommissionsTab';
import ContractTab from '@/components/business-tabs/ContractTab';
import ServicesTab from '@/components/business-tabs/ServicesTab';
import BookingsTab from '@/components/business-tabs/BookingsTab';
import PromotionsTab from '@/components/business-tabs/PromotionsTab';
import ReviewsList from '@/components/ReviewsList';
import BackButton from '@/components/BackButton';
import { apiFetch, ApiError } from '@/lib/api';

// HOME_SERVICE deliberately excluded — it's derived automatically by ServicesService the first
// time a business's service is set to "a domicilio"/"ambas" (see apps/api's
// SERVICE_TYPE_CATEGORY_SLUGS/resolveLocationType), never a manual toggle. Showing an editable
// button for it here would let Admin fight that auto-derivation instead of just reflecting it.
type CapabilityType = 'SELLS_PRODUCTS' | 'DIRECTORY_LISTING' | 'SERVICES' | 'BOOKINGS' | 'PICKUP' | 'DELIVERY' | 'COUPONS';

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
  idType: 'RUC' | 'CEDULA';
  legalName: string;
  representativeName: string | null;
  taxId: string;
  addressLine: string;
  description: string | null;
  email: string;
  phone: string;
  city: string;
  status: string;
  bankName: string | null;
  bankAccountType: 'SAVINGS' | 'CHECKING' | null;
  bankAccountNumber: string | null;
  bankAccountHolderName: string | null;
  categories?: { name: string }[];
  species: { id: string; name: string }[];
  capabilities: Record<CapabilityType, boolean>;
}

interface Contract {
  id: string;
  status: 'PENDING_SIGNATURE' | 'SIGNED' | 'SUPERSEDED';
  sellsProducts: boolean;
  directoryListing: boolean;
  commissionRatePercent: string | number | null;
  membershipPlanName: string | null;
  membershipPriceUsd: string | number | null;
  membershipBillingFrequency: string | null;
  createdAt: string;
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
  { value: 'services', label: 'Servicios' },
  { value: 'bookings', label: 'Reservas' },
  { value: 'promotions', label: 'Promociones' },
  { value: 'coupons', label: 'Cupones' },
  { value: 'payments', label: 'Pagos' },
  { value: 'commissions', label: 'Comisiones' },
  { value: 'reviews', label: 'Reseñas' },
  { value: 'contract', label: 'Contrato' },
];

export default function BusinessDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') ?? 'overview';

  const [business, setBusiness] = useState<Business | null>(null);
  const [membership, setMembership] = useState<Membership | null | undefined>(undefined);
  const [contract, setContract] = useState<Contract | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [togglingCapability, setTogglingCapability] = useState<CapabilityType | null>(null);
  const [updatingMembership, setUpdatingMembership] = useState(false);
  const [actingOnStatus, setActingOnStatus] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [b, m, contracts] = await Promise.all([
        apiFetch<Business>(`/admin/businesses/${params.id}`),
        apiFetch<Membership | null>(`/admin/businesses/${params.id}/membership`).catch(() => null),
        apiFetch<Contract[]>(`/admin/businesses/${params.id}/contracts`).catch(() => []),
      ]);
      setBusiness(b);
      setMembership(m);
      // Newest first — the one whose frozen figures actually apply right now (PENDING_SIGNATURE
      // while awaiting a first or updated signature, SIGNED once done).
      setContract(contracts[0] ?? null);
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
    setError(null);
    setNotice(null);
    try {
      // Enabling SELLS_PRODUCTS/DIRECTORY_LISTING on an already-ACTIVE business may not apply
      // immediately — if it changes what the business owes BINGO+, the backend instead generates
      // a new contract and withholds the toggle until the business signs it from their own app.
      const result = await apiFetch<{ requiresSignature: boolean; pendingContractId?: string }>(
        `/admin/businesses/${params.id}/capabilities`,
        { method: 'PATCH', body: JSON.stringify({ capability, enabled }) },
      );
      if (result.requiresSignature) {
        setNotice(
          `${CAPABILITY_LABELS[capability]} no se activó todavía: se generó un contrato actualizado que el negocio debe firmar primero (pestaña Contrato).`,
        );
      }
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

  // Approving generates a contract (ContractsService, via BusinessesService.approve) instead of
  // activating right away — the business goes ACTIVE on its own once that contract gets signed
  // from the Business app, or via the manual "Activar" override below for edge cases.
  async function approve() {
    setActingOnStatus(true);
    setError(null);
    try {
      await apiFetch(`/admin/businesses/${params.id}/approve`, { method: 'PATCH', body: JSON.stringify({}) });
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
      <BackButton onClick={() => router.back()} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
        <h1 className="bingo-page-title" style={{ margin: 0 }}>{business.tradeName}</h1>
        <span className={`bingo-badge badge-${business.status.toLowerCase()}`}>{business.status}</span>
      </div>

      {error && (
        <div className="bingo-card" style={{ marginBottom: 16, color: 'var(--bingo-error)' }}>
          {error}
        </div>
      )}
      {notice && (
        <div className="bingo-card" style={{ marginBottom: 16, color: 'var(--bingo-warning)' }}>
          {notice}
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
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 14px' }}>Solicitud / Estado</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(business.status === 'PENDING' || business.status === 'UNDER_REVIEW') && (
                <>
                  <button className="bingo-button" disabled={actingOnStatus} onClick={approve}>
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
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 10px' }}>Datos de la solicitud</h2>
            <div style={{ fontSize: 13, marginBottom: 6 }}>
              Tipo: <strong>{business.idType === 'RUC' ? 'RUC' : 'Cédula'}</strong>
            </div>
            <div style={{ fontSize: 13, marginBottom: 6 }}>
              {business.idType === 'RUC' ? 'Razón social' : 'Nombre'}: <strong>{business.legalName}</strong>
            </div>
            {business.idType === 'RUC' && (
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                Representante legal: <strong>{business.representativeName ?? '—'}</strong>
              </div>
            )}
            <div style={{ fontSize: 13, marginBottom: 6 }}>
              {business.idType === 'RUC' ? 'RUC' : 'Cédula'}: <strong>{business.taxId}</strong>
            </div>
            <div style={{ fontSize: 13, marginBottom: 6 }}>Dirección: {business.addressLine}</div>
            {business.description && <div style={{ fontSize: 13, marginBottom: 6 }}>Descripción: {business.description}</div>}
            <div style={{ fontSize: 13 }}>
              Mascotas: {business.species.length > 0 ? business.species.map((s) => s.name).join(', ') : '—'}
            </div>
          </div>

          <div className="bingo-card">
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 10px' }}>Información bancaria</h2>
            <div style={{ fontSize: 13, marginBottom: 6 }}>
              Banco: <strong>{business.bankName ?? '—'}</strong>
            </div>
            <div style={{ fontSize: 13, marginBottom: 6 }}>
              Tipo de cuenta:{' '}
              <strong>
                {business.bankAccountType === 'SAVINGS'
                  ? 'Ahorros'
                  : business.bankAccountType === 'CHECKING'
                    ? 'Corriente'
                    : '—'}
              </strong>
            </div>
            <div style={{ fontSize: 13, marginBottom: 6 }}>
              Número de cuenta: <strong>{business.bankAccountNumber ?? '—'}</strong>
            </div>
            <div style={{ fontSize: 13 }}>
              Titular: <strong>{business.bankAccountHolderName ?? '—'}</strong>
            </div>
          </div>

          <div className="bingo-card">
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 14px' }}>Capacidades</h2>
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

          {business.capabilities?.SELLS_PRODUCTS && (
            <div className="bingo-card">
              <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 10px' }}>Comisión contratada</h2>
              {contract === undefined ? (
                <p style={{ fontSize: 13 }}>Cargando…</p>
              ) : contract?.sellsProducts && contract.commissionRatePercent != null ? (
                <>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>{Number(contract.commissionRatePercent).toFixed(2)}%</div>
                  <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 4 }}>
                    Sobre cada venta en el Marketplace — congelada al generarse el contrato el{' '}
                    {new Date(contract.createdAt).toLocaleDateString('es-EC')}. Cambiarla requiere un contrato nuevo.
                  </div>
                </>
              ) : (
                <p style={{ fontSize: 13, color: '#7f8ea3' }}>Se definirá al aprobar la solicitud.</p>
              )}
            </div>
          )}

          {business.capabilities?.DIRECTORY_LISTING && (
            <div className="bingo-card">
              <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 10px' }}>Membresía</h2>
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
          )}
        </div>
      )}

      {tab === 'products' && <ProductsTab businessId={business.id} />}
      {tab === 'orders' && <OrdersTab businessId={business.id} />}
      {tab === 'services' && <ServicesTab businessId={business.id} />}
      {tab === 'bookings' && <BookingsTab businessId={business.id} />}
      {tab === 'promotions' && <PromotionsTab businessId={business.id} />}
      {tab === 'coupons' && <CouponsTab businessId={business.id} />}
      {tab === 'payments' && <PaymentsTab businessId={business.id} />}
      {tab === 'commissions' && <CommissionsTab businessId={business.id} />}
      {tab === 'reviews' && <ReviewsList targetType="BUSINESS" targetId={business.id} />}
      {tab === 'contract' && <ContractTab businessId={business.id} />}
    </AdminShell>
  );
}
