'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, getAccessToken, getActiveBusinessId } from '@/lib/api';
import { BusinessContract, getBusinessContract, signBusinessContract } from '@/lib/business';
import ContractDocument from '@/components/ContractDocument';

// The canvas's CSS size (style width: 100%) and its internal pixel resolution (width=520
// attribute) rarely match on a real phone screen — without rescaling here, the drawn stroke
// lands wherever the coordinate ratio happens to put it, not under the actual finger/cursor.
function getPointerPosition(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}

/**
 * Reached automatically by DashboardShell whenever Business.status is APPROVED but not yet
 * ACTIVE — not wrapped in DashboardShell itself (same reasoning as /select-business and /apply):
 * it IS the thing DashboardShell is waiting on. Draws directly to a <canvas> (no library) since a
 * signature is just freehand ink, exported as a PNG data URL on submit.
 */
export default function ContractPage() {
  const router = useRouter();
  const businessId = getActiveBusinessId();
  const [contract, setContract] = useState<BusinessContract | null | undefined>(undefined);
  const [hasSignature, setHasSignature] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    if (!businessId) {
      router.replace('/select-business');
      return;
    }
    getBusinessContract(businessId).then(setContract).catch(() => setContract(null));
  }, [businessId, router]);

  function ctx() {
    return canvasRef.current?.getContext('2d') ?? null;
  }

  function beginStroke(x: number, y: number) {
    const c = ctx();
    if (!c) return;
    drawingRef.current = true;
    c.beginPath();
    c.moveTo(x, y);
  }

  function extendStroke(x: number, y: number) {
    if (!drawingRef.current) return;
    const c = ctx();
    if (!c) return;
    c.lineWidth = 2.5;
    c.lineCap = 'round';
    c.strokeStyle = '#172b4d';
    c.lineTo(x, y);
    c.stroke();
    setHasSignature(true);
  }

  function endStroke() {
    drawingRef.current = false;
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    const c = ctx();
    if (!canvas || !c) return;
    c.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  }

  async function handleSign() {
    if (!businessId || !canvasRef.current || !hasSignature) return;
    setSubmitting(true);
    setError(null);
    try {
      const signatureDataUrl = canvasRef.current.toDataURL('image/png');
      const signed = await signBusinessContract(businessId, signatureDataUrl);
      setContract(signed);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo firmar el contrato.');
    } finally {
      setSubmitting(false);
    }
  }

  if (contract === undefined) {
    return (
      <div className="bingo-app-narrow bingo-content" style={{ paddingTop: 40 }}>
        <p style={{ color: '#7f8ea3', fontSize: 13 }}>Cargando…</p>
      </div>
    );
  }

  if (contract === null) {
    return (
      <div className="bingo-app-narrow bingo-content" style={{ paddingTop: 40 }}>
        <div className="bingo-error-banner">No encontramos un contrato pendiente para este negocio.</div>
      </div>
    );
  }

  if (contract.status === 'SIGNED') {
    return (
      <div className="bingo-app-narrow bingo-content" style={{ paddingTop: 40, maxWidth: 480 }}>
        <div className="bingo-logo" style={{ fontSize: 20, marginBottom: 12 }}>
          ¡Contrato firmado!
        </div>
        <p style={{ fontSize: 13, color: '#7f8ea3', marginBottom: 20 }}>
          Tu negocio ya está activo en BINGO+. Te enviamos una copia del contrato en PDF a tu correo de contacto.
        </p>
        {contract.pdfUrl && (
          <a href={contract.pdfUrl} target="_blank" rel="noreferrer" className="bingo-button secondary" style={{ marginBottom: 12, width: 'auto', display: 'inline-block' }}>
            Ver PDF del contrato
          </a>
        )}
        <button className="bingo-button" onClick={() => router.replace('/')}>
          Ir a mi negocio
        </button>
      </div>
    );
  }

  return (
    <div className="bingo-app-narrow bingo-content" style={{ paddingTop: 24, maxWidth: 600 }}>
      <div className="bingo-logo" style={{ fontSize: 20, marginBottom: 4 }}>
        Contrato de afiliación
      </div>
      <p style={{ fontSize: 13, color: '#7f8ea3', marginBottom: 20 }}>
        Tu negocio fue aprobado. Lee y firma el contrato para activarlo en BINGO+.
      </p>

      {/* The full resolved contract text below already opens with its own COMPARECIENTES clause
          (real names, RUC/cédula, domicilio) — a separate paraphrased summary card here would just
          duplicate it, so this reads the actual document instead of a stand-in for it. */}
      <div className="bingo-card" style={{ marginBottom: 16, maxHeight: 420, overflowY: 'auto' }}>
        <ContractDocument text={contract.contractText} />
      </div>

      {contract.bingoPlusSignatureImageUrl && (
        <div className="bingo-card" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 8px' }}>Firma de BINGO+</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={contract.bingoPlusSignatureImageUrl} alt="Firma de BINGO+" style={{ maxWidth: 220, maxHeight: 90, display: 'block' }} />
          {contract.bingoPlusRepresentativeName && (
            <p style={{ fontSize: 12, color: '#7f8ea3', margin: '6px 0 0' }}>Por BINGO+ — {contract.bingoPlusRepresentativeName}</p>
          )}
        </div>
      )}

      <div className="bingo-card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 8px' }}>Tu firma</h2>
        <canvas
          ref={canvasRef}
          width={520}
          height={160}
          style={{ width: '100%', height: 160, border: '1px dashed #d8dee6', borderRadius: 8, touchAction: 'none', background: 'white' }}
          onMouseDown={(e) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const { x, y } = getPointerPosition(canvas, e.clientX, e.clientY);
            beginStroke(x, y);
          }}
          onMouseMove={(e) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const { x, y } = getPointerPosition(canvas, e.clientX, e.clientY);
            extendStroke(x, y);
          }}
          onMouseUp={endStroke}
          onMouseLeave={endStroke}
          onTouchStart={(e) => {
            const canvas = canvasRef.current;
            const touch = e.touches[0];
            if (!canvas || !touch) return;
            const { x, y } = getPointerPosition(canvas, touch.clientX, touch.clientY);
            beginStroke(x, y);
          }}
          onTouchMove={(e) => {
            const canvas = canvasRef.current;
            const touch = e.touches[0];
            if (!canvas || !touch) return;
            const { x, y } = getPointerPosition(canvas, touch.clientX, touch.clientY);
            extendStroke(x, y);
          }}
          onTouchEnd={endStroke}
        />
        <button
          type="button"
          className="bingo-button secondary small"
          style={{ marginTop: 8, width: 'auto' }}
          onClick={clearSignature}
        >
          Limpiar firma
        </button>
      </div>

      {error && <div className="bingo-error-banner" style={{ marginBottom: 14 }}>{error}</div>}

      <button className="bingo-button" disabled={!hasSignature || submitting} onClick={handleSign}>
        {submitting ? 'Firmando…' : 'Firmar contrato'}
      </button>
    </div>
  );
}
