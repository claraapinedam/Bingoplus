'use client';

import { FormEvent, useState } from 'react';
import Image from 'next/image';
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
      router.push('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', minHeight: '100vh', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <Image
          className="logo-entrance"
          src="/bingoplus%20logo.png"
          alt="BINGO+"
          width={1536}
          height={1024}
          priority
          style={{ width: 220, height: 'auto', margin: '0 auto' }}
        />
      </div>

      <form onSubmit={handleSubmit} className="bingo-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <EmailField email={email} onEmailChange={setEmail} />

        <PasswordInput password={password} onPasswordChange={setPassword} />

        {error && <div className="bingo-error-banner">{error}</div>}

        <button className="bingo-button" type="submit" disabled={loading || !isValidEmail(email)}>
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>

        <p style={{ textAlign: 'center', fontSize: 13, color: '#7f8ea3', margin: 0 }}>
          ¿No tienes cuenta? <a href="/register" style={{ color: 'var(--bingo-teal)', fontWeight: 700 }}>Regístrate</a>
        </p>
      </form>
    </div>
  );
}
