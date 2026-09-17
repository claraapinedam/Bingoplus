'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, register } from '@/lib/api';
import PasswordField, { passwordMeetsPolicy } from '@/components/PasswordField';

/**
 * Step 1 of becoming a rider: create the account. Registering here always creates a plain
 * CUSTOMER account, same as apps/customer — the RIDER role is only attached once the full
 * application form at /apply is submitted (and later approved). RiderShell sends a freshly
 * logged-in user with no RIDER role straight to /apply, so this page just needs to sign in and
 * hand off; it doesn't decide anything about rider status itself.
 */
export default function RegisterPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = passwordMeetsPolicy(password) && password === confirmPassword;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    try {
      await register({ firstName, lastName, email, password });
      router.push('/apply');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear la cuenta.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', minHeight: '100vh', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div className="bingo-logo" style={{ color: 'var(--bingo-navy)', fontSize: 30 }}>
          BINGO<span className="plus" style={{ color: 'var(--bingo-teal)' }}>+</span>
        </div>
        <div style={{ fontSize: 13, color: '#7f8ea3', marginTop: 2 }}>Conviértete en Rider</div>
      </div>

      <form onSubmit={handleSubmit} className="bingo-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <label style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>
            Nombre
            <input className="bingo-input" required value={firstName} onChange={(e) => setFirstName(e.target.value)} style={{ marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>
            Apellido
            <input className="bingo-input" required value={lastName} onChange={(e) => setLastName(e.target.value)} style={{ marginTop: 4 }} />
          </label>
        </div>

        <label style={{ fontSize: 13, fontWeight: 600 }}>
          Correo electrónico
          <input className="bingo-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={{ marginTop: 4 }} />
        </label>

        <PasswordField
          label="Contraseña"
          password={password}
          onPasswordChange={setPassword}
          confirmPassword={confirmPassword}
          onConfirmPasswordChange={setConfirmPassword}
        />

        {error && <div className="bingo-error-banner">{error}</div>}

        <button className="bingo-button" type="submit" disabled={loading || !canSubmit}>
          {loading ? 'Creando cuenta…' : 'Crear cuenta y continuar'}
        </button>

        <p style={{ textAlign: 'center', fontSize: 13, color: '#7f8ea3', margin: 0 }}>
          ¿Ya tienes cuenta? <a href="/login" style={{ color: 'var(--bingo-teal)', fontWeight: 700 }}>Inicia sesión</a>
        </p>
      </form>
    </div>
  );
}
