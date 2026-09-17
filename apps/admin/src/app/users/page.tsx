'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import PasswordField, { passwordMeetsPolicy } from '@/components/PasswordField';
import { apiFetch, decodeRoles, getAccessToken, ApiError } from '@/lib/api';

interface StaffUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  isActive: boolean;
  createdAt: string;
}

const ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
  { value: 'USER', label: 'Usuario (sin acceso a Analíticas/Configuración)' },
];

export default function UsersPage() {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<StaffUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  // Creating a new staff account is ADMIN/SUPER_ADMIN only (see AdminUsersController.create's
  // method-level @Roles override) — a USER account can list/suspend but never mint another one.
  const [canCreate, setCanCreate] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newConfirmPassword, setNewConfirmPassword] = useState('');
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newRole, setNewRole] = useState('USER');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const canSubmitCreate = passwordMeetsPolicy(newPassword) && newPassword === newConfirmPassword;

  useEffect(() => {
    const token = getAccessToken();
    if (token) {
      const roles = decodeRoles(token);
      setCanCreate(roles.includes('ADMIN') || roles.includes('SUPER_ADMIN'));
    }
  }, []);

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

  async function createUser(e: FormEvent) {
    e.preventDefault();
    if (!canSubmitCreate) return;
    setCreating(true);
    setCreateError(null);
    try {
      await apiFetch('/admin/users', {
        method: 'POST',
        body: JSON.stringify({ email: newEmail, password: newPassword, firstName: newFirstName, lastName: newLastName, role: newRole }),
      });
      setNewEmail('');
      setNewPassword('');
      setNewConfirmPassword('');
      setNewFirstName('');
      setNewLastName('');
      setNewRole('USER');
      setShowCreateForm(false);
      await load();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'No se pudo crear el usuario.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <AdminShell>
      <h1 className="bingo-page-title">Usuarios</h1>
      <p className="bingo-page-subtitle">
        Cuentas con acceso a este panel administrativo (ADMIN / SUPER_ADMIN / USER). Los
        compradores están en Clientes y los repartidores en Riders.
      </p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          className="bingo-input"
          style={{ maxWidth: 320 }}
          placeholder="Buscar por nombre o correo…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {canCreate && (
          <button className="bingo-button" style={{ width: 'auto' }} onClick={() => setShowCreateForm((v) => !v)}>
            {showCreateForm ? 'Cancelar' : '+ Crear usuario'}
          </button>
        )}
      </div>

      {showCreateForm && canCreate && (
        <form onSubmit={createUser} className="bingo-card" style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 480 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>Nuevo usuario del panel</h2>
          {createError && <div style={{ color: 'var(--bingo-error)', fontSize: 13 }}>{createError}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Nombre</label>
              <input className="bingo-input" required value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Apellido</label>
              <input className="bingo-input" required value={newLastName} onChange={(e) => setNewLastName(e.target.value)} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Correo</label>
            <input className="bingo-input" type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          </div>
          <PasswordField
            label="Contraseña"
            password={newPassword}
            onPasswordChange={setNewPassword}
            confirmPassword={newConfirmPassword}
            onConfirmPasswordChange={setNewConfirmPassword}
          />
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Rol</label>
            <select className="bingo-input" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <button className="bingo-button" type="submit" disabled={creating || !canSubmitCreate} style={{ width: 'auto', alignSelf: 'flex-start' }}>
            {creating ? 'Creando…' : 'Crear usuario'}
          </button>
        </form>
      )}

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
