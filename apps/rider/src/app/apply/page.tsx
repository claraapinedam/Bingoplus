'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError, forceRefreshSession, getAccessToken } from '@/lib/api';
import RiderApplyForm, { RiderApplyValues } from '@/components/RiderApplyForm';

/**
 * Reached automatically by RiderShell when a logged-in user's token doesn't carry the RIDER
 * role yet. Deliberately NOT wrapped in RiderShell (no bottom nav — there's nothing to navigate
 * to as a rider until this succeeds), just its own lightweight "must be logged in" check.
 */
export default function ApplyPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    setReady(true);
  }, [router]);

  async function submit(values: RiderApplyValues) {
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/rider/apply', { method: 'POST', body: JSON.stringify(values) });
      // The role just attached server-side isn't in the token we're already holding — a fresh
      // token (via refresh) is what actually lets RiderShell's role check pass on the next page.
      await forceRefreshSession();
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar la solicitud.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) return null;

  if (submitted) {
    return (
      <div className="bingo-content" style={{ paddingTop: 40 }}>
        <div className="bingo-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
          <h2 style={{ margin: '0 0 8px' }}>Solicitud enviada</h2>
          <p style={{ fontSize: 13, color: '#7f8ea3', margin: '0 0 20px' }}>
            Tu solicitud fue enviada al equipo de BINGO+ para revisión. Te avisaremos cuando sea aprobada.
          </p>
          <button className="bingo-button" onClick={() => router.push('/login')}>
            Entendido
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bingo-content" style={{ paddingTop: 24, paddingBottom: 40 }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div className="bingo-logo" style={{ color: 'var(--bingo-navy)', fontSize: 24 }}>
          BINGO<span className="plus" style={{ color: 'var(--bingo-teal)' }}>+</span> Rider
        </div>
        <p style={{ fontSize: 13, color: '#7f8ea3', margin: '8px 0 0' }}>
          Completa tu solicitud para convertirte en rider. Un miembro del equipo la revisará antes de aprobarla.
        </p>
      </div>

      {error && <div className="bingo-error-banner" style={{ marginBottom: 14 }}>{error}</div>}

      <div className="bingo-card">
        <RiderApplyForm submitting={submitting} onSubmit={submit} />
      </div>
    </div>
  );
}
