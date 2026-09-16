'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import AdminShell from '@/components/AdminShell';
import RatingCell from '@/components/RatingCell';
import DeliveriesTab from '@/components/customer-tabs/DeliveriesTab';
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
      <button className="bingo-button secondary" style={{ marginBottom: 16, padding: '8px 14px', fontSize: 13 }} onClick={() => router.back()}>
        ← Volver
      </button>

      <h1 className="bingo-page-title">
        {customer.firstName} {customer.lastName}
        {customer.roles.includes('BUSINESS_OWNER') && (
          <span className="bingo-badge badge-approved" style={{ fontSize: 11, marginLeft: 10, verticalAlign: 'middle' }}>
            Dueño de negocio
          </span>
        )}
      </h1>
      <p className="bingo-page-subtitle">
        {customer.email} · {customer.phone ?? 'sin teléfono'} ·{' '}
        <span className={`bingo-badge ${customer.isActive ? 'badge-active' : 'badge-suspended'}`}>
          {customer.isActive ? 'Activo' : 'Suspendido'}
        </span>
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
