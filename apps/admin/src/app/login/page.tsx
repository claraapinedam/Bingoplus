'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, login } from '@/lib/api';
import EmailField, { isValidEmail } from '@/components/EmailField';
import PasswordInput from '@/components/PasswordInput';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValidEmail(email)) return;
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

        <EmailField email={email} onEmailChange={setEmail} />

        <PasswordInput password={password} onPasswordChange={setPassword} />

        {error && (
          <p style={{ color: 'var(--bingo-error)', fontSize: 13, margin: 0 }}>{error}</p>
        )}

        <button className="bingo-button" type="submit" disabled={loading || !isValidEmail(email)}>
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
