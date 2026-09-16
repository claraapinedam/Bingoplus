'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import RatingCell from '@/components/RatingCell';
import { apiFetch, ApiError } from '@/lib/api';

interface Customer {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  isActive: boolean;
  ratingAvg: number;
  reviewCount: number;
  purchasesCount: number;
  createdAt: string;
}

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const query = search ? `?search=${encodeURIComponent(search)}` : '';
      const data = await apiFetch<Customer[]>(`/admin/customers${query}`);
      setCustomers(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar la lista de clientes.');
    }
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleActive(customer: Customer) {
    setActingOn(customer.id);
    try {
      await apiFetch(`/admin/customers/${customer.id}/${customer.isActive ? 'suspend' : 'activate'}`, {
        method: 'PATCH',
        body: JSON.stringify({}),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'La acción falló.');
    } finally {
      setActingOn(null);
    }
  }

  return (
    <AdminShell>
      <h1 className="bingo-page-title">Clientes</h1>
      <p className="bingo-page-subtitle">
        Compradores de la plataforma — busca, activa o suspende cuentas de clientes.
      </p>

      <div style={{ marginBottom: 16, maxWidth: 320 }}>
        <input
          className="bingo-input"
          placeholder="Buscar por nombre o correo…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && (
        <div className="bingo-card" style={{ marginBottom: 16, color: 'var(--bingo-error)' }}>
          {error}
        </div>
      )}

      <div className="bingo-card">
        {customers === null ? (
          <p>Cargando…</p>
        ) : customers.length === 0 ? (
          <p>No se encontraron clientes.</p>
        ) : (
          <table className="bingo-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Rating</th>
                <th>Compras</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td>
                    <a href={`/customers/${c.id}`}>
                      {c.firstName} {c.lastName}
                    </a>
                    {c.roles.includes('BUSINESS_OWNER') && (
                      <>
                        {' '}
                        <span className="bingo-badge badge-approved" style={{ fontSize: 10 }}>
                          Dueño de negocio
                        </span>
                      </>
                    )}
                  </td>
                  <td>{c.email}</td>
                  <td>
                    <RatingCell ratingAvg={c.ratingAvg} reviewCount={c.reviewCount} />
                  </td>
                  <td>{c.purchasesCount}</td>
                  <td>
                    <span className={`bingo-badge ${c.isActive ? 'badge-active' : 'badge-suspended'}`}>
                      {c.isActive ? 'Activo' : 'Suspendido'}
                    </span>
                  </td>
                  <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <a href={`/customers/${c.id}`} className="bingo-button secondary">
                      Ver
                    </a>
                    <button
                      className={`bingo-button ${c.isActive ? 'danger' : ''}`}
                      disabled={actingOn === c.id}
                      onClick={() => toggleActive(c)}
                    >
                      {c.isActive ? 'Suspender' : 'Activar'}
                    </button>
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
