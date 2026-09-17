'use client';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

export default function EmailField({
  label = 'Correo electrónico',
  email,
  onEmailChange,
  variant = 'inline',
}: {
  label?: string;
  email: string;
  onEmailChange: (v: string) => void;
  /** 'inline' wraps the input inside the label (login). 'block' renders the label as its own
   * element above the input, matching the Usuarios create-user form. */
  variant?: 'inline' | 'block';
}) {
  const touched = email.length > 0;
  const valid = isValidEmail(email);
  const errorMessage = touched && !valid && (
    <div style={{ fontSize: 12, fontWeight: 400, color: 'var(--bingo-error)', marginTop: 4 }}>
      Ingresa un correo válido (ej. nombre@dominio.com)
    </div>
  );
  const inputStyle = { marginTop: 4, ...(touched && !valid ? { borderColor: 'var(--bingo-error)' } : {}) };

  if (variant === 'block') {
    return (
      <div>
        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>{label}</label>
        <input className="bingo-input" type="email" required value={email} onChange={(e) => onEmailChange(e.target.value)} style={inputStyle} />
        {errorMessage}
      </div>
    );
  }

  return (
    <label style={{ fontSize: 13, fontWeight: 600 }}>
      {label}
      <input className="bingo-input" type="email" required value={email} onChange={(e) => onEmailChange(e.target.value)} style={inputStyle} />
      {errorMessage}
    </label>
  );
}
