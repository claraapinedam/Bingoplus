'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { apiFetch, ApiError } from '@/lib/api';

interface StaffUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  isActive: boolean;
  createdAt: string;
}

export default function UsersPage() {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<StaffUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const query = search ? `?search=${encodeURIComponent(search)}` : '';
      const data = await apiFetch<StaffUser[]>(`/admin/users${query}`);
      setUsers(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar la lista de usuarios.');
    }
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleActive(user: StaffUser) {
    setActingOn(user.id);
    try {
      await apiFetch(`/admin/users/${user.id}/${user.isActive ? 'suspend' : 'activate'}`, {
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
      <h1 className="bingo-page-title">Usuarios</h1>
      <p className="bingo-page-subtitle">
        Cuentas con acceso a este panel administrativo (ADMIN / SUPER_ADMIN). Los compradores
        están en Clientes y los repartidores en Riders.
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
        {users === null ? (
          <p>Cargando…</p>
        ) : users.length === 0 ? (
          <p>No se encontraron usuarios.</p>
        ) : (
          <table className="bingo-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.firstName} {u.lastName}
                  </td>
                  <td>{u.email}</td>
                  <td>{u.roles.join(', ')}</td>
                  <td>
                    <span className={`bingo-badge ${u.isActive ? 'badge-active' : 'badge-suspended'}`}>
                      {u.isActive ? 'Activo' : 'Suspendido'}
                    </span>
                  </td>
                  <td>
                    <button
                      className={`bingo-button ${u.isActive ? 'danger' : ''}`}
                      disabled={actingOn === u.id}
                      onClick={() => toggleActive(u)}
                    >
                      {u.isActive ? 'Suspender' : 'Activar'}
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
