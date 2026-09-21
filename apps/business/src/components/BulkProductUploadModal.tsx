'use client';

import { useRef, useState } from 'react';
import { apiFetch, ApiError, downloadFile, postFormData } from '@/lib/api';

interface BulkProductRow {
  row: number;
  raw: Record<string, string>;
  fieldErrors: Record<string, string>;
  product?: Record<string, unknown>;
  valid: boolean;
}

const FIELD_LABELS: { key: string; header: string }[] = [
  { key: 'Nombre*', header: 'Nombre' },
  { key: 'Categoría*', header: 'Categoría' },
  { key: 'Precio*', header: 'Precio' },
  { key: 'Precio de oferta', header: 'P. oferta' },
  { key: 'Stock*', header: 'Stock' },
  { key: 'IVA (General/Exento)', header: 'IVA' },
  { key: 'Especies (separadas por coma)', header: 'Especies' },
];
// Maps each spreadsheet header above to the fieldErrors key the backend uses for it.
const FIELD_ERROR_KEYS: Record<string, string> = {
  'Nombre*': 'name',
  'Categoría*': 'category',
  'Precio*': 'price',
  'Precio de oferta': 'salePrice',
  'Stock*': 'stock',
  'IVA (General/Exento)': 'taxCategory',
  'Especies (separadas por coma)': 'species',
};

type Step = 'menu' | 'review';

export default function BulkProductUploadModal({ businessId, onClose, onCreated }: { businessId: string; onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState<Step>('menu');
  const [rows, setRows] = useState<BulkProductRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function downloadTemplate() {
    setBusy(true);
    setError(null);
    try {
      await downloadFile(`/business/${businessId}/products/bulk-template`, 'plantilla-productos-bingoplus.xlsx');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo descargar la plantilla.');
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const result = await postFormData<{ rows: BulkProductRow[]; allValid: boolean }>(
        `/business/${businessId}/products/bulk-validate`,
        form,
      );
      setRows(result.rows);
      setStep('review');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo leer el archivo.');
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const allValid = rows !== null && rows.every((r) => r.valid);

  async function confirmCreate() {
    if (!rows || !allValid) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/business/${businessId}/products/bulk-create`, {
        method: 'POST',
        body: JSON.stringify({ products: rows.map((r) => r.product) }),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron crear los productos.');
      setBusy(false);
    }
  }

  return (
    <div className="dashboard-modal-overlay" onClick={busy ? undefined : onClose}>
      <div
        className="bingo-card"
        style={{ maxWidth: step === 'review' ? 900 : 480, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {step === 'menu' && (
          <>
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 6px' }}>Carga masiva de productos</h2>
            <p style={{ fontSize: 12, color: '#7f8ea3', margin: '0 0 16px' }}>
              Descarga la plantilla, complétala con tus productos y súbela — las imágenes no van en la plantilla, se
              agregan después entrando a cada producto.
            </p>
            {error && <div className="bingo-error-banner" style={{ marginBottom: 12 }}>{error}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button className="bingo-button secondary" disabled={busy} onClick={downloadTemplate}>
                📥 Descargar plantilla
              </button>
              <button className="bingo-button" disabled={busy} onClick={() => fileInputRef.current?.click()}>
                {busy ? 'Procesando…' : '📤 Subir productos'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                style={{ display: 'none' }}
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              <button className="bingo-button secondary" disabled={busy} onClick={onClose}>
                Cancelar
              </button>
            </div>
          </>
        )}

        {step === 'review' && rows && (
          <>
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 6px' }}>Revisión del archivo</h2>
            <p style={{ fontSize: 12, color: allValid ? 'var(--bingo-success)' : 'var(--bingo-error)', margin: '0 0 12px', fontWeight: 700 }}>
              {allValid
                ? `${rows.length} de ${rows.length} fila(s) correcta(s) — listo para crear.`
                : `${rows.filter((r) => r.valid).length} de ${rows.length} fila(s) correcta(s) — corrige el archivo y vuelve a subirlo.`}
            </p>
            {error && <div className="bingo-error-banner" style={{ marginBottom: 12 }}>{error}</div>}

            <div style={{ overflowX: 'auto' }}>
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Fila</th>
                    <th>Estado</th>
                    {FIELD_LABELS.map((f) => (
                      <th key={f.key}>{f.header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.row}>
                      <td>{r.row}</td>
                      <td>
                        <span className="bingo-badge" style={{ background: '#f2f4f7', color: r.valid ? 'var(--bingo-success)' : 'var(--bingo-error)' }}>
                          {r.valid ? 'OK' : 'Error'}
                        </span>
                      </td>
                      {FIELD_LABELS.map((f) => {
                        const errKey = FIELD_ERROR_KEYS[f.key];
                        const fieldError = r.fieldErrors[errKey];
                        return (
                          <td key={f.key} style={fieldError ? { color: 'var(--bingo-error)' } : undefined}>
                            <div>{r.raw[f.key] || '—'}</div>
                            {fieldError && <div style={{ fontSize: 11 }}>{fieldError}</div>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="bingo-button secondary" disabled={busy} onClick={onClose}>
                Cancelar
              </button>
              {allValid && (
                <button className="bingo-button" disabled={busy} onClick={confirmCreate}>
                  {busy ? 'Creando…' : `Continuar — crear ${rows.length} producto(s)`}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
