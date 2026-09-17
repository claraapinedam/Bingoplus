'use client';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

export default function EmailField({
  label = 'Correo electrónico',
  email,
  onEmailChange,
}: {
  label?: string;
  email: string;
  onEmailChange: (v: string) => void;
}) {
  const touched = email.length > 0;
  const valid = isValidEmail(email);

  return (
    <label style={{ fontSize: 13, fontWeight: 600 }}>
      {label}
      <input
        className="bingo-input"
        type="email"
        required
        value={email}
        onChange={(e) => onEmailChange(e.target.value)}
        style={{ marginTop: 4, ...(touched && !valid ? { borderColor: 'var(--bingo-error)' } : {}) }}
      />
      {touched && !valid && (
        <div style={{ fontSize: 12, fontWeight: 400, color: 'var(--bingo-error)', marginTop: 4 }}>
          Ingresa un correo válido (ej. nombre@dominio.com)
        </div>
      )}
    </label>
  );
}
