'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import CustomerShell from '@/components/CustomerShell';
import AddressForm, { AddressFormValues } from '@/components/AddressForm';
import EmptyState from '@/components/EmptyState';
import { apiFetch, ApiError } from '@/lib/api';

interface Address {
  id: string;
  label: string;
  line1: string;
  line2: string | null;
  country: string;
  state: string | null;
  city: string;
  parish: string | null;
  notes: string | null;
  isDefault: boolean;
  latitude: number | null;
  longitude: number | null;
}

function EditAddressContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const returnTo = useSearchParams().get('returnTo');

  const [address, setAddress] = useState<Address | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Address[]>('/addresses')
      .then((list) => setAddress(list.find((a) => a.id === params.id) ?? null))
      .catch(() => setAddress(null));
  }, [params.id]);

  async function handleSubmit(values: AddressFormValues) {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/addresses/${params.id}`, {
        method: 'PATCH',
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

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await apiFetch(`/addresses/${params.id}`, { method: 'DELETE' });
      router.push('/addresses');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo eliminar la dirección.');
      setDeleting(false);
    }
  }

  if (address === null) {
    return (
      <CustomerShell>
        <div className="bingo-content">
          <EmptyState title="Dirección no encontrada" />
        </div>
      </CustomerShell>
    );
  }

  return (
    <CustomerShell>
      <header className="bingo-header">
        <button
          className="bingo-button secondary small"
          style={{ marginBottom: 10 }}
          onClick={() => router.back()}
        >
          ← Volver
        </button>
        <div className="bingo-logo" style={{ fontSize: 18 }}>
          Editar dirección
        </div>
      </header>

      <div className="bingo-content">
        {error && <div className="bingo-error-banner" style={{ marginBottom: 12 }}>{error}</div>}
        {address === undefined ? (
          <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
        ) : (
          <>
            <AddressForm
              initial={{
                label: address.label,
                line1: address.line1,
                line2: address.line2 ?? '',
                state: address.state ?? '',
                city: address.city,
                parish: address.parish ?? '',
                notes: address.notes ?? '',
                latitude: address.latitude ?? undefined,
                longitude: address.longitude ?? undefined,
              }}
              submitting={saving}
              submitLabel="Guardar cambios"
              onSubmit={handleSubmit}
            />
            <button
              className="bingo-button secondary"
              style={{ marginTop: 12, color: 'var(--bingo-error)' }}
              disabled={deleting}
              onClick={handleDelete}
            >
              {deleting ? 'Eliminando…' : 'Eliminar dirección'}
            </button>
          </>
        )}
      </div>
    </CustomerShell>
  );
}

export default function EditAddressPage() {
  return (
    <Suspense fallback={null}>
      <EditAddressContent />
    </Suspense>
  );
}
