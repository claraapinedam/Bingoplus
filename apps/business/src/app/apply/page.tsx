'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import BusinessApplyForm, { BusinessApplyValues } from '@/components/BusinessApplyForm';
import BackButton from '@/components/BackButton';
import { apiFetch, ApiError, getAccessToken, setActiveBusinessId } from '@/lib/api';

/** Reached from /select-business's "+ Crear negocio" — not wrapped in DashboardShell (same
 * reasoning as /select-business itself): it runs before there's any active business to scope the
 * shell to. Requires being logged in (POST /me/business attaches the new Business to the caller's
 * existing User account), so an unauthenticated visit bounces to /login same as everywhere else. */
export default function ApplyBusinessPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  if (typeof window !== 'undefined' && !getAccessToken()) {
    router.replace('/login');
    return null;
  }

  async function handleSubmit(values: BusinessApplyValues) {
    setSubmitting(true);
    setError(null);
    try {
      const created = await apiFetch<{ id: string; couponError?: string }>('/me/business', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      setActiveBusinessId(created.id);
      // If the coupon failed, pause here instead of redirecting straight away — the business
      // itself was still created successfully, but the applicant should see why the discount
      // didn't apply rather than just silently losing it.
      if (created.couponError) {
        setCouponError(created.couponError);
        setSubmitting(false);
        return;
      }
      router.push('/select-business');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar la solicitud.');
      setSubmitting(false);
    }
  }

  if (couponError) {
    return (
      <div className="bingo-app-narrow bingo-content" style={{ paddingTop: 40, maxWidth: 480 }}>
        <div className="bingo-logo" style={{ fontSize: 20, marginBottom: 16 }}>
          Solicitud enviada
        </div>
        <div className="bingo-error-banner" style={{ marginBottom: 14 }}>
          Tu negocio se creó correctamente, pero el código de descuento no se pudo aplicar: {couponError}
        </div>
        <button className="bingo-button" onClick={() => router.push('/select-business')}>
          Continuar
        </button>
      </div>
    );
  }

  return (
    <div className="bingo-app-narrow bingo-content" style={{ paddingTop: 24, maxWidth: 600 }}>
      <BackButton onClick={() => router.push('/select-business')} />
      <div className="bingo-logo" style={{ fontSize: 20, marginBottom: 4 }}>
        Crear negocio
      </div>
      <p style={{ fontSize: 13, color: '#7f8ea3', marginBottom: 20 }}>
        Tu solicitud será revisada por el equipo de BINGO+ antes de activarse.
      </p>
      {error && <div className="bingo-error-banner" style={{ marginBottom: 14 }}>{error}</div>}
      <BusinessApplyForm submitting={submitting} onSubmit={handleSubmit} />
    </div>
  );
}
