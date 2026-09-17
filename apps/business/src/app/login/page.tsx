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
      // No role check here — real access is BusinessUser membership, verified by
      // /select-business's GET /me/business call (which also shows a clear message if empty).
      await login(email, password);
      router.push('/select-business');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bingo-app-narrow" style={{ padding: 24, display: 'flex', flexDirection: 'column', minHeight: '100vh', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div className="bingo-logo" style={{ color: 'var(--bingo-navy)', fontSize: 30 }}>
          BINGO<span className="plus" style={{ color: 'var(--bingo-teal)' }}>+</span>
        </div>
        <div style={{ fontSize: 13, color: '#7f8ea3', marginTop: 2 }}>Negocios</div>
      </div>

      <form onSubmit={handleSubmit} className="bingo-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <EmailField email={email} onEmailChange={setEmail} />

        <PasswordInput password={password} onPasswordChange={setPassword} />

        {error && <div className="bingo-error-banner">{error}</div>}

        <button className="bingo-button" type="submit" disabled={loading || !isValidEmail(email)}>
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
