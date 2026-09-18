'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import CustomerShell from '@/components/CustomerShell';
import BackButton from '@/components/BackButton';
import EmptyState from '@/components/EmptyState';
import { apiFetch, ApiError } from '@/lib/api';

interface Address {
  id: string;
  label: string;
  line1: string;
  line2: string | null;
  state: string | null;
  city: string;
  parish: string | null;
  notes: string | null;
  isDefault: boolean;
}

function AddressesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo');

  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch<Address[]>('/addresses').then(setAddresses).catch(() => setAddresses([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function selectAddress(address: Address) {
    if (!returnTo) return; // browsing mode: tapping a row does nothing, use the pencil to edit
    if (!address.isDefault) {
      setBusyId(address.id);
      try {
        await apiFetch(`/addresses/${address.id}`, { method: 'PATCH', body: JSON.stringify({ isDefault: true }) });
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'No se pudo seleccionar la dirección.');
        setBusyId(null);
        return;
      }
    }
    router.push(`/${returnTo}`);
  }

  const defaultAddress = addresses?.find((a) => a.isDefault) ?? null;
  const otherAddresses = addresses?.filter((a) => !a.isDefault) ?? [];

  function AddressRow({ address }: { address: Address }) {
    return (
      <div
        className="bingo-card"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 8,
          marginBottom: 8,
          cursor: returnTo ? 'pointer' : 'default',
          opacity: busyId === address.id ? 0.6 : 1,
        }}
        onClick={() => selectAddress(address)}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{address.label}</div>
          <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 2 }}>
            {address.line1}
            {address.line2 ? `, ${address.line2}` : ''}, {address.city}
            {address.state ? `, ${address.state}` : ''}
          </div>
          {address.notes && <div style={{ fontSize: 11, color: '#9aa5b1', marginTop: 2 }}>{address.notes}</div>}
        </div>
        <a
          href={`/addresses/${address.id}${returnTo ? `?returnTo=${returnTo}` : ''}`}
          onClick={(e) => e.stopPropagation()}
          style={{ fontSize: 16, flexShrink: 0 }}
          aria-label="Editar dirección"
        >
          ✏️
        </a>
      </div>
    );
  }

  return (
    <CustomerShell>
      <header className="bingo-header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo%20para%20fondo%20osc.png" alt="BINGO+" className="bingo-logo-img" style={{ display: 'block', marginBottom: 10 }} />
        <BackButton onClick={() => router.back()} light />
        <div className="bingo-header-sub">
          {returnTo ? 'Toca una dirección para usarla en tu pedido' : 'Mis direcciones'}
        </div>
      </header>

      <div className="bingo-content">
        {error && <div className="bingo-error-banner" style={{ marginBottom: 12 }}>{error}</div>}

        {addresses === null ? (
          <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
        ) : addresses.length === 0 ? (
          <EmptyState title="Todavía no tienes direcciones guardadas" />
        ) : (
          <>
            {defaultAddress && (
              <>
                <h2 className="bingo-section-title" style={{ marginTop: 0 }}>
                  Dirección de entrega
                </h2>
                <AddressRow address={defaultAddress} />
              </>
            )}
            {otherAddresses.length > 0 && (
              <>
                <h2 className="bingo-section-title">Otras direcciones</h2>
                {otherAddresses.map((a) => (
                  <AddressRow key={a.id} address={a} />
                ))}
              </>
            )}
          </>
        )}

        <a
          href={`/addresses/new${returnTo ? `?returnTo=${returnTo}` : ''}`}
          className="bingo-button"
          style={{ marginTop: 16, display: 'block', textAlign: 'center' }}
        >
          + Agregar dirección
        </a>
      </div>
    </CustomerShell>
  );
}

export default function AddressesPage() {
  return (
    <Suspense fallback={null}>
      <AddressesContent />
    </Suspense>
  );
}
