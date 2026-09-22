'use client';

import { useRef, useState } from 'react';
import { uploadFile } from '@/lib/api';

/** A single-image field that uploads from the device instead of asking for a URL — mirrors
 * apps/business's ImageUploadField. Used anywhere a rider needs to submit a photo (e.g. profile
 * documents) rather than paste a link they'd never actually have. */
export default function ImageUploadField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { url } = await uploadFile(file);
      onChange(url);
    } catch {
      setError('No se pudo subir la imagen.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>{label}</label>
      {value && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt=""
          style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 10, border: '1px solid #e0e4ea', marginBottom: 6, display: 'block' }}
        />
      )}
      <input ref={inputRef} type="file" accept="image/*" onChange={(e) => handleFile(e.target.files?.[0])} disabled={busy} />
      {busy && <p style={{ fontSize: 12, color: '#7f8ea3', margin: '6px 0 0' }}>Subiendo…</p>}
      {error && <p style={{ fontSize: 12, color: 'var(--bingo-error)', margin: '6px 0 0' }}>{error}</p>}
    </div>
  );
}
