'use client';

const REQUIREMENTS: { label: string; test: (v: string) => boolean }[] = [
  { label: 'Al menos 8 caracteres', test: (v) => v.length >= 8 },
  { label: 'Una letra mayúscula', test: (v) => /[A-Z]/.test(v) },
  { label: 'Una letra minúscula', test: (v) => /[a-z]/.test(v) },
  { label: 'Un número', test: (v) => /\d/.test(v) },
  { label: 'Un carácter especial (!@#$…)', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

/** Same policy enforced server-side (IsStrongPassword) — this is only a UX convenience; the real
 * check always happens on the backend regardless of what this returns. */
export function passwordMeetsPolicy(password: string): boolean {
  return REQUIREMENTS.every((r) => r.test(password));
}

export default function PasswordField({
  label,
  password,
  onPasswordChange,
  confirmPassword,
  onConfirmPasswordChange,
}: {
  label: string;
  password: string;
  onPasswordChange: (v: string) => void;
  confirmPassword: string;
  onConfirmPasswordChange: (v: string) => void;
}) {
  const touched = password.length > 0;
  const confirmTouched = confirmPassword.length > 0;
  const match = password === confirmPassword;

  return (
    <>
      <label style={{ fontSize: 13, fontWeight: 600 }}>
        {label}
        <input
          className="bingo-input"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          style={{ marginTop: 4 }}
        />
      </label>

      {touched && (
        <ul style={{ margin: '-6px 0 0', padding: 0, listStyle: 'none', fontSize: 12 }}>
          {REQUIREMENTS.map((r) => {
            const ok = r.test(password);
            return (
              <li key={r.label} style={{ color: ok ? 'var(--bingo-success)' : '#9aa5b1', marginBottom: 2 }}>
                {ok ? '✓' : '○'} {r.label}
              </li>
            );
          })}
        </ul>
      )}

      <label style={{ fontSize: 13, fontWeight: 600 }}>
        Confirmar contraseña
        <input
          className="bingo-input"
          type="password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => onConfirmPasswordChange(e.target.value)}
          style={{ marginTop: 4 }}
        />
      </label>
      {confirmTouched && (
        <div style={{ fontSize: 12, marginTop: -6, color: match ? 'var(--bingo-success)' : 'var(--bingo-error)' }}>
          {match ? '✓ Las contraseñas coinciden' : '✕ Las contraseñas no coinciden'}
        </div>
      )}
    </>
  );
}
