'use client';

import { useState } from 'react';

/** Standalone password field with a show/hide toggle — used for login. This app never creates a
 * password itself (business accounts are created via apps/customer's register + apply flow). */
export default function PasswordInput({
  label = 'Contraseña',
  password,
  onPasswordChange,
}: {
  label?: string;
  password: string;
  onPasswordChange: (v: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <label style={{ fontSize: 13, fontWeight: 600 }}>
      {label}
      <div style={{ position: 'relative', marginTop: 4 }}>
        <input
          className="bingo-input"
          type={visible ? 'text' : 'password'}
          required
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          style={{ paddingRight: 40 }}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          style={{
            position: 'absolute',
            right: 6,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 16,
            padding: 6,
            lineHeight: 1,
          }}
        >
          {visible ? '🙈' : '👁️'}
        </button>
      </div>
    </label>
  );
}
