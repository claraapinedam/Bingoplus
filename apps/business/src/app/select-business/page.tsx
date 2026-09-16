'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import EmptyState from '@/components/EmptyState';
import { apiFetch, clearTokens, getAccessToken, setActiveBusinessId } from '@/lib/api';

interface Business {
  id: string;
  tradeName: string;
  city: string;
  status: string;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente de aprobación',
  UNDER_REVIEW: 'En revisión',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
  SUSPENDED: 'Suspendido',
  ACTIVE: 'Activo',
};

/**
 * Reached automatically by DashboardShell whenever no business is selected yet. Not wrapped in
 * DashboardShell itself (same reasoning as the Rider App's /apply screen) — it IS the thing that
 * resolves what DashboardShell is waiting for.
 */
export default function SelectBusinessPage() {
  const router = useRouter();
  const [businesses, setBusinesses] = useState<Business[] | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    apiFetch<Business[]>('/me/business')
      .then((list) => {
        setBusinesses(list);
        if (list.length === 1) {
          setActiveBusinessId(list[0].id);
          router.replace('/orders');
        }
      })
      .catch(() => setBusinesses([]));
  }, [router]);

  function select(id: string) {
    setActiveBusinessId(id);
    router.push('/orders');
  }

  function logout() {
    clearTokens();
    router.push('/login');
  }

  if (businesses === null) {
    return (
      <div className="bingo-app-narrow bingo-content" style={{ paddingTop: 40 }}>
        <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
      </div>
    );
  }

  return (
    <div className="bingo-app-narrow bingo-content" style={{ paddingTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div className="bingo-logo" style={{ fontSize: 20 }}>
          BINGO<span className="plus" style={{ color: 'var(--bingo-teal)' }}>+</span> Negocios
        </div>
        <button className="bingo-button secondary small" onClick={logout}>
          Cerrar sesión
        </button>
      </div>

      {businesses.length === 0 ? (
        <EmptyState
          title="No tienes negocios en BINGO+"
          subtitle="Esta cuenta no está asociada a ningún negocio todavía."
        />
      ) : (
        <>
          <h2 className="bingo-section-title" style={{ marginTop: 0 }}>
            Elige un negocio
          </h2>
          {businesses.map((b) => (
            <button
              key={b.id}
              className="bingo-card"
              style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 10, border: 'none', cursor: 'pointer' }}
              onClick={() => select(b.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{b.tradeName}</div>
                {b.status !== 'ACTIVE' && (
                  <span className="bingo-badge" style={{ background: '#fff4e5', color: 'var(--bingo-warning)' }}>
                    {STATUS_LABELS[b.status] ?? b.status}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 2 }}>{b.city}</div>
            </button>
          ))}
        </>
      )}

      <button className="bingo-button secondary" style={{ marginTop: 8 }} onClick={() => router.push('/apply')}>
        {businesses.length === 0 ? '+ Crear negocio' : '+ Crear otro negocio'}
      </button>
    </div>
  );
}
