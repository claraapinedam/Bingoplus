'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, login } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      router.push('/businesses');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bingo-soft-gray)',
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="bingo-card"
        style={{ width: 360, display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <div className="bingo-logo" style={{ color: 'var(--bingo-navy)', fontSize: 26 }}>
          BINGO<span className="plus" style={{ color: 'var(--bingo-teal)' }}>+</span>
        </div>
        <p style={{ margin: 0, color: '#7f8ea3', fontSize: 14 }}>Panel administrativo</p>

        <label style={{ fontSize: 13, fontWeight: 600 }}>
          Correo electrónico
          <input
            className="bingo-input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ marginTop: 4 }}
          />
        </label>

        <label style={{ fontSize: 13, fontWeight: 600 }}>
          Contraseña
          <input
            className="bingo-input"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ marginTop: 4 }}
          />
        </label>

        {error && (
          <p style={{ color: 'var(--bingo-error)', fontSize: 13, margin: 0 }}>{error}</p>
        )}

        <button className="bingo-button" type="submit" disabled={loading}>
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
