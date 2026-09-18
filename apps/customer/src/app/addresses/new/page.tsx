'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import CustomerShell from '@/components/CustomerShell';
import BackButton from '@/components/BackButton';
import AddressForm, { AddressFormValues } from '@/components/AddressForm';
import { apiFetch, ApiError } from '@/lib/api';

function NewAddressContent() {
  const router = useRouter();
  const returnTo = useSearchParams().get('returnTo');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(values: AddressFormValues) {
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/addresses', {
        method: 'POST',
        body: JSON.stringify({
          label: values.label,
          line1: values.line1,
          line2: values.line2 || undefined,
          country: values.country,
          state: values.state,
          city: values.city,
          parish: values.parish || undefined,
          notes: values.notes || undefined,
          latitude: values.latitude,
          longitude: values.longitude,
        }),
      });
      router.push(returnTo ? `/${returnTo}` : '/addresses');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar la dirección.');
      setSaving(false);
    }
  }

  return (
    <CustomerShell>
      <header className="bingo-header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo%20para%20fondo%20osc.png" alt="BINGO+" className="bingo-logo-img" style={{ display: 'block', marginBottom: 10 }} />
        <BackButton onClick={() => router.back()} light />
        <div className="bingo-header-sub">Agregar dirección</div>
      </header>

      <div className="bingo-content">
        {error && <div className="bingo-error-banner" style={{ marginBottom: 12 }}>{error}</div>}
        <AddressForm submitting={saving} submitLabel="Guardar dirección" onSubmit={handleSubmit} />
      </div>
    </CustomerShell>
  );
}

export default function NewAddressPage() {
  return (
    <Suspense fallback={null}>
      <NewAddressContent />
    </Suspense>
  );
}
