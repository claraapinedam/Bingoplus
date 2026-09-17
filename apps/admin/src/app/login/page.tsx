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
        <div style={{ textAlign: 'center' }}>
          <Image
            src="/Bingo%20plus%20manager.png"
            alt="BINGO+ Manager"
            width={2171}
            height={724}
            priority
            style={{ width: 200, height: 'auto', margin: '8px auto' }}
          />
        </div>
        <p style={{ margin: 0, color: '#7f8ea3', fontSize: 14, textAlign: 'center' }}>Panel administrativo</p>

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
