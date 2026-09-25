'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import AdminShell from '@/components/AdminShell';
import RatingCell from '@/components/RatingCell';
import DeliveriesTab from '@/components/customer-tabs/DeliveriesTab';
import BackButton from '@/components/BackButton';
import { apiFetch, ApiError } from '@/lib/api';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

interface CustomerDetail {
  id: string;
  email: string;
  phone: string | null;
  firstName: string;
  lastName: string;
  roles: string[];
  isActive: boolean;
  ratingAvg: number;
  reviewCount: number;
  purchasesCount: number;
  purchasesTotal: number;
  createdAt: string;
  termsAcceptedAt: string | null;
  privacyNoticeAcceptedAt: string | null;
  marketingConsentAt: string | null;
  registrationIp: string | null;
}

const TABS = [
  { value: 'overview', label: 'Resumen' },
  { value: 'deliveries', label: 'Entregas' },
];

export default function AdminCustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') ?? 'overview';

  const [customer, setCustomer] = useState<CustomerDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setCustomer(await apiFetch<CustomerDetail>(`/admin/customers/${params.id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar el cliente.');
      setCustomer(null);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  function setTab(value: string) {
    router.replace(`/customers/${params.id}?tab=${value}`);
  }

  async function toggleActive() {
    if (!customer) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/admin/customers/${params.id}/${customer.isActive ? 'suspend' : 'activate'}`, {
        method: 'PATCH',
        body: JSON.stringify({}),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'La acción falló.');
    } finally {
      setBusy(false);
    }
  }

  if (customer === undefined) {
    return (
      <AdminShell>
        <p>Cargando…</p>
      </AdminShell>
    );
  }
  if (!customer) {
    return (
      <AdminShell>
        <div className="bingo-card" style={{ color: 'var(--bingo-error)' }}>{error ?? 'Cliente no encontrado.'}</div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <BackButton onClick={() => router.back()} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
        <h1 className="bingo-page-title" style={{ margin: 0 }}>
          {customer.firstName} {customer.lastName}
        </h1>
        {customer.roles.includes('BUSINESS_OWNER') && (
          <span className="bingo-badge badge-approved" style={{ fontSize: 11 }}>Dueño de negocio</span>
        )}
        <span>{customer.email} · {customer.phone ?? 'sin teléfono'}</span>
        <span className={`bingo-badge ${customer.isActive ? 'badge-active' : 'badge-suspended'}`}>
          {customer.isActive ? 'Activo' : 'Suspendido'}
        </span>
      </div>

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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
          <div className="bingo-card">
            <div style={{ fontSize: 22, fontWeight: 800 }}>{customer.purchasesCount}</div>
            <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 4 }}>Pedidos (no cancelados)</div>
          </div>
          <div className="bingo-card">
            <div style={{ fontSize: 22, fontWeight: 800 }}>{currencyFormatter.format(customer.purchasesTotal)}</div>
            <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 4 }}>Total gastado</div>
          </div>
          <div className="bingo-card">
            <RatingCell ratingAvg={customer.ratingAvg} reviewCount={customer.reviewCount} />
            <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 4 }}>Rating</div>
          </div>
          <div className="bingo-card">
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Cuenta</div>
            <div style={{ fontSize: 12, color: '#9aa5b1', marginBottom: 10 }}>
              Cliente desde {new Date(customer.createdAt).toLocaleDateString('es-EC')}
            </div>
            <div style={{ fontSize: 12, color: '#54617a', marginBottom: 4 }}>
              Términos y Condiciones:{' '}
              {customer.termsAcceptedAt ? (
                <span style={{ color: 'var(--bingo-success)' }}>Aceptados el {new Date(customer.termsAcceptedAt).toLocaleString('es-EC')}</span>
              ) : (
                <span style={{ color: 'var(--bingo-error)' }}>No registrado</span>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#54617a', marginBottom: 4 }}>
              Política de Privacidad:{' '}
              {customer.privacyNoticeAcceptedAt ? (
                <span style={{ color: 'var(--bingo-success)' }}>
                  Informado el {new Date(customer.privacyNoticeAcceptedAt).toLocaleString('es-EC')}
                </span>
              ) : (
                <span style={{ color: 'var(--bingo-error)' }}>No registrado</span>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#54617a', marginBottom: 4 }}>
              Comunicaciones comerciales:{' '}
              {customer.marketingConsentAt ? (
                <span style={{ color: 'var(--bingo-success)' }}>Autorizadas el {new Date(customer.marketingConsentAt).toLocaleString('es-EC')}</span>
              ) : (
                <span style={{ color: '#9aa5b1' }}>No autorizadas</span>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#54617a', marginBottom: 10 }}>
              IP de registro: <strong>{customer.registrationIp ?? '—'}</strong>
            </div>
            <button className={`bingo-button ${customer.isActive ? 'danger' : ''}`} disabled={busy} onClick={toggleActive}>
              {customer.isActive ? 'Suspender' : 'Activar'}
            </button>
          </div>
        </div>
      )}

      {tab === 'deliveries' && <DeliveriesTab userId={customer.id} />}
    </AdminShell>
  );
}
