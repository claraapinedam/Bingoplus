'use client';

import { FormEvent, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ApiError, login } from '@/lib/api';
import EmailField, { isValidEmail } from '@/components/EmailField';
import PasswordInput from '@/components/PasswordInput';
import GoogleLoginButton from '@/components/GoogleLoginButton';

// Rider shares its account (and password) with Customer — there's no separate reset flow, the
// link just sends the user to where that flow actually lives.
const CUSTOMER_APP_URL = process.env.NEXT_PUBLIC_CUSTOMER_APP_URL ?? 'http://localhost:3002';

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
      <div style={{ textAlign: 'center', marginTop: 24, marginBottom: 4, height: 100, overflow: 'hidden' }}>
        <Image
          src="/Bingoplusrider.png"
          alt="BINGO+ Rider"
          width={1645}
          height={956}
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

        <GoogleLoginButton app="rider" />

        <p style={{ textAlign: 'center', fontSize: 13, margin: 0 }}>
          <a href={`${CUSTOMER_APP_URL}/forgot-password`} style={{ color: 'var(--bingo-teal)', fontWeight: 700 }}>
            ¿Olvidaste tu contraseña?
          </a>
        </p>

        <p style={{ textAlign: 'center', fontSize: 12, color: '#7f8ea3', margin: 0 }}>
          Inicia sesión con tu usuario y contraseña de BINGO+. Si aún no eres rider, después de
          ingresar podrás solicitarlo.
        </p>
      </form>
    </div>
  );
}
