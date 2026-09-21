'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardShell, { useBusiness } from '@/components/DashboardShell';
import ServiceForm, { ServiceFormValues } from '@/components/ServiceForm';
import { apiFetch, ApiError, getActiveBusinessId } from '@/lib/api';

function NewServiceContent() {
  const router = useRouter();
  const { business } = useBusiness();
  const businessId = getActiveBusinessId();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(values: ServiceFormValues) {
    if (!businessId) return;
    setSaving(true);
    setError(null);
    try {
      const created = await apiFetch<{ id: string }>(`/business/${businessId}/services`, {
        method: 'POST',
        body: JSON.stringify(values),
      });
      router.push(`/services/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el servicio.');
      setSaving(false);
    }
  }

  return (
    <>
      <button className="bingo-button secondary small" style={{ marginBottom: 16, width: 'auto' }} onClick={() => router.push('/services')}>
        ← Servicios
      </button>
      <header className="dashboard-page-header">
        <div className="dashboard-page-title">Nuevo servicio</div>
      </header>
      {error && <div className="bingo-error-banner" style={{ marginBottom: 14, maxWidth: 640 }}>{error}</div>}
      <ServiceForm
        submitting={saving}
        submitLabel="Crear servicio"
        onSubmit={handleSubmit}
        homeServiceEnabled={business.capabilities.HOME_SERVICE}
      />
    </>
  );
}

export default function NewServicePage() {
  return (
    <DashboardShell>
      <NewServiceContent />
    </DashboardShell>
  );
}
