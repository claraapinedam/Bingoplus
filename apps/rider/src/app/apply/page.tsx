'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError, forceRefreshSession, getAccessToken } from '@/lib/api';

/**
 * Reached automatically by RiderShell when a logged-in user's token doesn't carry the RIDER
 * role yet. Deliberately NOT wrapped in RiderShell (no bottom nav — there's nothing to navigate
 * to as a rider until this succeeds), just its own lightweight "must be logged in" check.
 */
export default function ApplyPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    setReady(true);
  }, [router]);

  async function apply() {
    setApplying(true);
    setError(null);
    try {
      await apiFetch('/rider/apply', { method: 'POST' });
      // The role just attached server-side isn't in the token we're already holding — a fresh
      // token (via refresh) is what actually lets RiderShell's role check pass on the next page.
      await forceRefreshSession();
      router.push('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar la solicitud.');
      setApplying(false);
    }
  }

  if (!ready) return null;

  return (
    <div className="bingo-content" style={{ paddingTop: 40 }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div className="bingo-logo" style={{ color: 'var(--bingo-navy)', fontSize: 26 }}>
          BINGO<span className="plus" style={{ color: 'var(--bingo-teal)' }}>+</span> Rider
        </div>
      </div>

      <div className="bingo-card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🛵</div>
        <h2 style={{ margin: '0 0 8px' }}>Conviértete en Rider</h2>
        <p style={{ fontSize: 13, color: '#7f8ea3', margin: '0 0 20px' }}>
          Tu cuenta de BINGO+ todavía no tiene acceso de repartidor. Solicítalo ahora — después de
          aprobado podrás conectarte y recibir entregas.
        </p>

        {error && <div className="bingo-error-banner" style={{ marginBottom: 12 }}>{error}</div>}

        <button className="bingo-button" onClick={apply} disabled={applying}>
          {applying ? 'Enviando solicitud…' : 'Solicitar ser Rider'}
        </button>
      </div>
    </div>
  );
}
