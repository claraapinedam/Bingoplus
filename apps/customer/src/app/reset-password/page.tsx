'use client';

import { FormEvent, Suspense, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiError, resetPassword } from '@/lib/api';
import PasswordField, { passwordMeetsPolicy } from '@/components/PasswordField';

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get('token');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const canSubmit = Boolean(token) && passwordMeetsPolicy(password) && password === confirmPassword;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || !token) return;
    setError(null);
    setLoading(true);
    try {
      await resetPassword(token, password);
      setDone(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo restablecer la contraseña.');
    } finally {
      setLoading(false);
    }
  }

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

      <div className="bingo-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!token ? (
          <p style={{ fontSize: 14, textAlign: 'center', margin: 0 }}>
            Este enlace no es válido. Solicita uno nuevo desde{' '}
            <a href="/forgot-password" style={{ color: 'var(--bingo-teal)', fontWeight: 700 }}>
              ¿Olvidaste tu contraseña?
            </a>
          </p>
        ) : done ? (
          <p style={{ fontSize: 14, textAlign: 'center', margin: 0 }}>
            Tu contraseña se actualizó correctamente. Te llevamos a inicio de sesión…
          </p>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 13, color: '#7f8ea3', margin: 0 }}>Elige tu nueva contraseña.</p>

            <PasswordField
              label="Nueva contraseña"
              password={password}
              onPasswordChange={setPassword}
              confirmPassword={confirmPassword}
              onConfirmPasswordChange={setConfirmPassword}
            />

            {error && <div className="bingo-error-banner">{error}</div>}

            <button className="bingo-button" type="submit" disabled={loading || !canSubmit}>
              {loading ? 'Guardando…' : 'Restablecer contraseña'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
