'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import RatingCell from '@/components/RatingCell';
import IconButton from '@/components/IconButton';
import { apiFetch, apiFetchPage, ApiError } from '@/lib/api';

interface Business {
  id: string;
  tradeName: string;
  city: string;
  status: string;
  email: string;
  phone: string;
  categories?: { name: string }[];
  ratingAvg: number;
  reviewCount: number;
  salesCount: number;
  salesTotal: number;
  createdAt: string;
}

const LIVE_STATUSES = ['ACTIVE', 'SUSPENDED'];

const STATUS_TABS = [
  { value: '', label: 'Todos' },
  { value: 'ACTIVE', label: 'Activos' },
  { value: 'SUSPENDED', label: 'Suspendidos' },
];

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

export default function BusinessesPage() {
  const [status, setStatus] = useState('');
  const [businesses, setBusinesses] = useState<Business[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      if (status) {
        const result = await apiFetchPage<Business>(`/admin/businesses?status=${status}&pageSize=100`);
        setBusinesses(result.data);
        setTotal(result.meta.total);
      } else {
        const result = await apiFetchPage<Business>(`/admin/businesses?pageSize=200`);
        const filtered = result.data.filter((b) => LIVE_STATUSES.includes(b.status));
        setBusinesses(filtered);
        setTotal(filtered.length);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar la lista de negocios.');
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(id: string, action: 'activate' | 'suspend') {
    setActingOn(id);
    try {
      await apiFetch(`/admin/businesses/${id}/${action}`, { method: 'PATCH', body: JSON.stringify({}) });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'La acción falló.');
    } finally {
      setActingOn(null);
    }
  }

  return (
    <AdminShell>
      <h1 className="bingo-page-title" style={{ marginBottom: 24 }}>Negocios</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatus(tab.value)}
            className={`bingo-button ${status === tab.value ? '' : 'secondary'}`}
            style={{ padding: '8px 14px', fontSize: 13 }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bingo-card" style={{ marginBottom: 16, color: 'var(--bingo-error)' }}>
          {error}
        </div>
      )}

      <div className="bingo-card">
        {businesses === null ? (
          <p>Cargando…</p>
        ) : businesses.length === 0 ? (
          <p>No hay negocios en este estado.</p>
        ) : (
          <table className="bingo-table">
            <thead>
              <tr>
                <th>Negocio</th>
                <th>Categoría</th>
                <th>Ciudad</th>
                <th>Rating</th>
                <th>Ventas</th>
                <th>Estado</th>
                <th>Contacto</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {businesses.map((b) => (
                <tr key={b.id}>
                  <td>{b.tradeName}</td>
                  <td>{b.categories?.map((c) => c.name).join(', ') || '—'}</td>
                  <td>{b.city}</td>
                  <td>
                    <RatingCell ratingAvg={b.ratingAvg} reviewCount={b.reviewCount} />
                  </td>
                  <td>
                    {b.salesCount}
                    {b.salesCount > 0 && (
                      <>
                        <br />
                        <span style={{ color: '#7f8ea3', fontSize: 12 }}>
                          {currencyFormatter.format(b.salesTotal)}
                        </span>
                      </>
                    )}
                  </td>
                  <td>
                    <span className={`bingo-badge badge-${b.status.toLowerCase()}`}>{b.status}</span>
                  </td>
                  <td>
                    {b.email}
                    <br />
                    {b.phone}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <IconButton icon="view" label="Ver" href={`/businesses/${b.id}`} />
                      {b.status === 'ACTIVE' && (
                        <IconButton icon="reject" label="Suspender" disabled={actingOn === b.id} onClick={() => runAction(b.id, 'suspend')} />
                      )}
                      {b.status === 'SUSPENDED' && (
                        <IconButton icon="approve" label="Reactivar" disabled={actingOn === b.id} onClick={() => runAction(b.id, 'activate')} />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminShell>
  );
}
