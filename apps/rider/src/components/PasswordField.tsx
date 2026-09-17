'use client';

import { useState } from 'react';

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

function ToggleVisibilityButton({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      style={{
        position: 'absolute',
        right: 6,
        top: '50%',
        transform: 'translateY(-50%)',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 6,
        lineHeight: 1,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={visible ? '/ojos%20cerrados.png' : '/ojos%20abiertos.png'} alt="" style={{ height: 18, width: 'auto' }} />
    </button>
  );
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
  const [visible, setVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const touched = password.length > 0;
  const confirmTouched = confirmPassword.length > 0;
  const match = password === confirmPassword;

  return (
    <>
      <label style={{ fontSize: 13, fontWeight: 600 }}>
        {label}
        <div style={{ position: 'relative', marginTop: 4 }}>
          <input
            className="bingo-input"
            type={visible ? 'text' : 'password'}
            required
            minLength={8}
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            style={{ paddingRight: 40 }}
          />
          <ToggleVisibilityButton visible={visible} onToggle={() => setVisible((v) => !v)} />
        </div>
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
        <div style={{ position: 'relative', marginTop: 4 }}>
          <input
            className="bingo-input"
            type={confirmVisible ? 'text' : 'password'}
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => onConfirmPasswordChange(e.target.value)}
            style={{ paddingRight: 40 }}
          />
          <ToggleVisibilityButton visible={confirmVisible} onToggle={() => setConfirmVisible((v) => !v)} />
        </div>
      </label>
      {confirmTouched && (
        <div style={{ fontSize: 12, marginTop: -6, color: match ? 'var(--bingo-success)' : 'var(--bingo-error)' }}>
          {match ? '✓ Las contraseñas coinciden' : '✕ Las contraseñas no coinciden'}
        </div>
      )}
    </>
  );
}
