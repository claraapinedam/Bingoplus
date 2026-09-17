'use client';

import { FormEvent, useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ApiError, apiFetch, clearTokens, getAccessToken, resendVerificationEmail, verifyEmail } from '@/lib/api';

interface Me {
  email: string;
  isEmailVerified: boolean;
}

export default function VerifyEmailPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    apiFetch<Me>('/me')
      .then((me) => {
        if (me.isEmailVerified) {
          router.replace('/');
          return;
        }
        setEmail(me.email);
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email || code.length !== 6) return;
    setError(null);
    setLoading(true);
    try {
      await verifyEmail(email, code);
      router.push('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Código inválido o expirado.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!email) return;
    setError(null);
    setResending(true);
    try {
      await resendVerificationEmail(email);
      setResent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo reenviar el código.');
    } finally {
      setResending(false);
    }
  }

  function handleLogout() {
    clearTokens();
    router.replace('/login');
  }

  if (!email) return null;

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', minHeight: '100vh', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <Image
          src="/bingoplus%20logo.png"
          alt="BINGO+"
          width={1536}
          height={1024}
          priority
          style={{ width: 220, height: 'auto', margin: '0 auto' }}
        />
      </div>

      <form onSubmit={handleSubmit} className="bingo-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ fontSize: 13, color: '#7f8ea3', margin: 0 }}>
          Enviamos un código de 6 dígitos a <strong>{email}</strong>. Ingrésalo para activar tu cuenta.
        </p>

        <label style={{ fontSize: 13, fontWeight: 600 }}>
          Código de verificación
          <input
            className="bingo-input"
            required
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            style={{ marginTop: 4, letterSpacing: 4, textAlign: 'center', fontSize: 18 }}
          />
        </label>

        {error && <div className="bingo-error-banner">{error}</div>}
        {resent && !error && (
          <div style={{ fontSize: 12, color: 'var(--bingo-success)' }}>Te enviamos un nuevo código.</div>
        )}

        <button className="bingo-button" type="submit" disabled={loading || code.length !== 6}>
          {loading ? 'Verificando…' : 'Verificar correo'}
        </button>

        <p style={{ textAlign: 'center', fontSize: 13, color: '#7f8ea3', margin: 0 }}>
          ¿No te llegó?{' '}
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            style={{ background: 'none', border: 'none', padding: 0, color: 'var(--bingo-teal)', fontWeight: 700, cursor: 'pointer' }}
          >
            Reenviar código
          </button>
        </p>

        <p style={{ textAlign: 'center', fontSize: 13, margin: 0 }}>
          <button
            type="button"
            onClick={handleLogout}
            style={{ background: 'none', border: 'none', padding: 0, color: '#7f8ea3', cursor: 'pointer' }}
          >
            Cerrar sesión
          </button>
        </p>
      </form>
    </div>
  );
}
