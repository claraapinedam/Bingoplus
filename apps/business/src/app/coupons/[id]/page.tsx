'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';
import EmptyState from '@/components/EmptyState';
import CouponForm, { CouponFormValues } from '@/components/CouponForm';
import { apiFetch, ApiError, getActiveBusinessId } from '@/lib/api';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  ACTIVE: 'Activo',
  PAUSED: 'Pausado',
  EXPIRED: 'Expirado',
  CANCELLED: 'Cancelado',
};

interface Coupon {
  id: string;
  code: string;
  title: string;
  description: string | null;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: string | number;
  minimumPurchase: string | number | null;
  maximumDiscount: string | number | null;
  startDate: string;
  expirationDate: string;
  usageLimit: number | null;
  usagePerCustomer: number | null;
  termsAndConditions: string | null;
  status: string;
}

function CouponDetailContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const businessId = getActiveBusinessId();
  const [coupon, setCoupon] = useState<Coupon | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!businessId) return;
    apiFetch<Coupon[]>(`/me/business/${businessId}/coupons`)
      .then((list) => setCoupon(list.find((c) => c.id === params.id) ?? null))
      .catch(() => setCoupon(null));
  }, [businessId, params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(values: CouponFormValues) {
    if (!businessId) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/me/business/${businessId}/coupons/${params.id}`, { method: 'PATCH', body: JSON.stringify(values) });
      router.push('/coupons');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el cupón.');
      setSaving(false);
    }
  }

  async function setStatus(action: 'activate' | 'pause' | 'cancel') {
    if (!businessId) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/me/business/${businessId}/coupons/${params.id}/${action}`, { method: 'PATCH' });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar el cupón.');
    } finally {
      setBusy(false);
    }
  }

  if (coupon === undefined) return <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>;
  if (!coupon) return <EmptyState title="Cupón no encontrado" />;

  const isTerminal = coupon.status === 'EXPIRED' || coupon.status === 'CANCELLED';

  return (
    <>
      <button className="bingo-button secondary small" style={{ marginBottom: 16, width: 'auto' }} onClick={() => router.push('/coupons')}>
        ← Cupones
      </button>
      <header className="dashboard-page-header">
        <div>
          <div className="dashboard-page-title">{coupon.code}</div>
          <div className="dashboard-page-subtitle">{STATUS_LABELS[coupon.status] ?? coupon.status}</div>
        </div>
        {!isTerminal && (
          <div style={{ display: 'flex', gap: 8 }}>
            {coupon.status !== 'ACTIVE' && (
              <button className="bingo-button secondary small" disabled={busy} onClick={() => setStatus('activate')}>
                Activar
              </button>
            )}
            {coupon.status === 'ACTIVE' && (
              <button className="bingo-button secondary small" disabled={busy} onClick={() => setStatus('pause')}>
                Pausar
              </button>
            )}
            <button className="bingo-button danger small" disabled={busy} onClick={() => setStatus('cancel')}>
              Cancelar
            </button>
          </div>
        )}
      </header>

      {error && <div className="bingo-error-banner" style={{ marginBottom: 14, maxWidth: 640 }}>{error}</div>}

      <CouponForm
        submitting={saving}
        submitLabel="Guardar cambios"
        onSubmit={handleSubmit}
        initial={{
          code: coupon.code,
          title: coupon.title,
          description: coupon.description ?? '',
          discountType: coupon.discountType,
          discountValue: Number(coupon.discountValue),
          minimumPurchase: coupon.minimumPurchase ? Number(coupon.minimumPurchase) : undefined,
          maximumDiscount: coupon.maximumDiscount ? Number(coupon.maximumDiscount) : undefined,
          startDate: coupon.startDate,
          expirationDate: coupon.expirationDate,
          usageLimit: coupon.usageLimit ?? undefined,
          usagePerCustomer: coupon.usagePerCustomer ?? undefined,
          termsAndConditions: coupon.termsAndConditions ?? '',
        }}
      />
    </>
  );
}

export default function CouponDetailPage() {
  return (
    <DashboardShell>
      <CouponDetailContent />
    </DashboardShell>
  );
}
