'use client';

import { FormEvent, useState } from 'react';
import Image from 'next/image';
import { ApiError, forgotPassword } from '@/lib/api';
import EmailField, { isValidEmail } from '@/components/EmailField';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValidEmail(email)) return;
    setError(null);
    setLoading(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar el correo.');
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
        {sent ? (
          <>
            <p style={{ fontSize: 14, textAlign: 'center', margin: 0 }}>
              Si <strong>{email}</strong> está registrado, te enviamos un correo con instrucciones para restablecer tu contraseña.
            </p>
            <a href="/login" className="bingo-button" style={{ textAlign: 'center', textDecoration: 'none' }}>
              Volver a inicio de sesión
            </a>
          </>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 13, color: '#7f8ea3', margin: 0 }}>
              Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.
            </p>

            <EmailField email={email} onEmailChange={setEmail} />

            {error && <div className="bingo-error-banner">{error}</div>}

            <button className="bingo-button" type="submit" disabled={loading || !isValidEmail(email)}>
              {loading ? 'Enviando…' : 'Enviar enlace'}
            </button>

            <p style={{ textAlign: 'center', fontSize: 13, color: '#7f8ea3', margin: 0 }}>
              <a href="/login" style={{ color: 'var(--bingo-teal)', fontWeight: 700 }}>Volver a inicio de sesión</a>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
