'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';
import CouponForm, { CouponFormValues } from '@/components/CouponForm';
import { apiFetch, ApiError, getActiveBusinessId } from '@/lib/api';

function NewCouponContent() {
  const router = useRouter();
  const businessId = getActiveBusinessId();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(values: CouponFormValues) {
    if (!businessId) return;
    setSaving(true);
    setError(null);
    try {
      const created = await apiFetch<{ id: string }>(`/me/business/${businessId}/coupons`, {
        method: 'POST',
        body: JSON.stringify(values),
      });
      router.push(`/coupons/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el cupón.');
      setSaving(false);
    }
  }

  return (
    <>
      <button className="bingo-button secondary small" style={{ marginBottom: 16, width: 'auto' }} onClick={() => router.push('/coupons')}>
        ← Cupones
      </button>
      <header className="dashboard-page-header">
        <div className="dashboard-page-title">Nuevo cupón</div>
      </header>
      {error && <div className="bingo-error-banner" style={{ marginBottom: 14, maxWidth: 640 }}>{error}</div>}
      <CouponForm submitting={saving} submitLabel="Crear cupón (borrador)" onSubmit={handleSubmit} />
    </>
  );
}

export default function NewCouponPage() {
  return (
    <DashboardShell>
      <NewCouponContent />
    </DashboardShell>
  );
}
