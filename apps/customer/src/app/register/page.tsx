'use client';

import { FormEvent, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ApiError, register } from '@/lib/api';
import PasswordField, { passwordMeetsPolicy } from '@/components/PasswordField';
import EmailField, { isValidEmail } from '@/components/EmailField';
import GoogleLoginButton from '@/components/GoogleLoginButton';
import CustomerTermsModal from '@/components/CustomerTermsModal';
import CustomerPrivacyModal from '@/components/CustomerPrivacyModal';

export default function RegisterPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyNoticeAccepted, setPrivacyNoticeAccepted] = useState(false);
  const [marketingConsentAccepted, setMarketingConsentAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const canSubmit =
    isValidEmail(email) &&
    passwordMeetsPolicy(password) &&
    password === confirmPassword &&
    termsAccepted &&
    privacyNoticeAccepted;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    try {
      await register({
        firstName,
        lastName,
        email,
        password,
        termsAccepted,
        privacyNoticeAccepted,
        marketingConsentAccepted,
      });
      router.push('/verify-email');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear la cuenta.');
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

        <EmailField email={email} onEmailChange={setEmail} />

        <PasswordField
          label="Contraseña"
          password={password}
          onPasswordChange={setPassword}
          confirmPassword={confirmPassword}
          onConfirmPasswordChange={setConfirmPassword}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ fontSize: 13, display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>
              Acepto los{' '}
              <button
                type="button"
                onClick={() => setShowTerms(true)}
                style={{ background: 'none', border: 'none', padding: 0, color: 'var(--bingo-teal)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}
              >
                Términos y Condiciones de BINGO+.
              </button>
            </span>
          </label>

          <label style={{ fontSize: 13, display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={privacyNoticeAccepted}
              onChange={(e) => setPrivacyNoticeAccepted(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>
              He sido informado sobre la{' '}
              <button
                type="button"
                onClick={() => setShowPrivacy(true)}
                style={{ background: 'none', border: 'none', padding: 0, color: 'var(--bingo-teal)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}
              >
                Política de Privacidad y Tratamiento de Datos Personales.
              </button>
            </span>
          </label>

          <label style={{ fontSize: 13, display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={marketingConsentAccepted}
              onChange={(e) => setMarketingConsentAccepted(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>
              Autorizo el tratamiento de mis datos para recibir promociones, descuentos y comunicaciones comerciales de BINGO+.
            </span>
          </label>
        </div>

        {error && <div className="bingo-error-banner">{error}</div>}

        <button className="bingo-button" type="submit" disabled={loading || !canSubmit}>
          {loading ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>

        <GoogleLoginButton app="customer" />

        <p style={{ textAlign: 'center', fontSize: 13, color: '#7f8ea3', margin: 0 }}>
          ¿Ya tienes cuenta? <a href="/login" style={{ color: 'var(--bingo-teal)', fontWeight: 700 }}>Inicia sesión</a>
        </p>
      </form>

      {showTerms && <CustomerTermsModal onClose={() => setShowTerms(false)} />}
      {showPrivacy && <CustomerPrivacyModal onClose={() => setShowPrivacy(false)} />}
    </div>
  );
}
