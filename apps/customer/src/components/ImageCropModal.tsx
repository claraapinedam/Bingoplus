'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Facebook-style "drag to reposition, slider to zoom" crop step shown right after picking a file
 * and before it's ever uploaded — so a huge photo is never stored as-is with the framing left to
 * chance (CSS `object-fit: cover` on display), and the user picks exactly what shows.
 */
export default function ImageCropModal({
  file,
  aspectRatio,
  outputWidth,
  onConfirm,
  onCancel,
}: {
  file: File;
  /** width / height, e.g. 16/9 */
  aspectRatio: number;
  outputWidth: number;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 320, height: 320 / aspectRatio });
  // baseScale: the zoom level at which the image exactly covers the viewport (zoom=1 baseline).
  const [baseScale, setBaseScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef({ active: false, startX: 0, startY: 0, startOffsetX: 0, startOffsetY: 0 });
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => setImgEl(img);
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    function measure() {
      const width = Math.min(viewportRef.current?.parentElement?.clientWidth ?? 320, 420);
      setViewportSize({ width, height: width / aspectRatio });
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [aspectRatio]);

  useEffect(() => {
    if (!imgEl) return;
    const scale = Math.max(viewportSize.width / imgEl.naturalWidth, viewportSize.height / imgEl.naturalHeight);
    setBaseScale(scale);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [imgEl, viewportSize.width, viewportSize.height]);

  if (!imgEl) {
    return (
      <div style={overlayStyle}>
        <div style={{ color: 'white' }}>Cargando imagen…</div>
      </div>
    );
  }

  const scale = baseScale * zoom;
  const scaledWidth = imgEl.naturalWidth * scale;
  const scaledHeight = imgEl.naturalHeight * scale;
  const maxOffsetX = Math.max(0, (scaledWidth - viewportSize.width) / 2);
  const maxOffsetY = Math.max(0, (scaledHeight - viewportSize.height) / 2);

  function clampOffset(x: number, y: number) {
    return {
      x: Math.min(maxOffsetX, Math.max(-maxOffsetX, x)),
      y: Math.min(maxOffsetY, Math.max(-maxOffsetY, y)),
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    drag.current = { active: true, startX: e.clientX, startY: e.clientY, startOffsetX: offset.x, startOffsetY: offset.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current.active) return;
    const next = clampOffset(drag.current.startOffsetX + (e.clientX - drag.current.startX), drag.current.startOffsetY + (e.clientY - drag.current.startY));
    setOffset(next);
  }

  function onPointerUp() {
    drag.current.active = false;
  }

  function onZoomChange(next: number) {
    if (!imgEl) return;
    setZoom(next);
    // Re-clamp the existing offset against the new scale so the image never leaves a gap.
    const nextScale = baseScale * next;
    const nextMaxX = Math.max(0, (imgEl.naturalWidth * nextScale - viewportSize.width) / 2);
    const nextMaxY = Math.max(0, (imgEl.naturalHeight * nextScale - viewportSize.height) / 2);
    setOffset((prev) => ({
      x: Math.min(nextMaxX, Math.max(-nextMaxX, prev.x)),
      y: Math.min(nextMaxY, Math.max(-nextMaxY, prev.y)),
    }));
  }

  function confirm() {
    if (!imgEl) return;
    setProcessing(true);
    const outputHeight = Math.round(outputWidth / aspectRatio);
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setProcessing(false);
      return;
    }
    // Visible top-left corner of the viewport, in source-image pixel space.
    const sourceX = imgEl.naturalWidth / 2 - viewportSize.width / 2 / scale - offset.x / scale;
    const sourceY = imgEl.naturalHeight / 2 - viewportSize.height / 2 / scale - offset.y / scale;
    const sourceW = viewportSize.width / scale;
    const sourceH = viewportSize.height / scale;
    ctx.drawImage(imgEl, sourceX, sourceY, sourceW, sourceH, 0, 0, outputWidth, outputHeight);
    canvas.toBlob(
      (blob) => {
        setProcessing(false);
        if (blob) onConfirm(blob);
      },
      'image/jpeg',
      0.88,
    );
  }

  return (
    <div style={overlayStyle}>
      <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', padding: 16, width: '100%', maxWidth: 460 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Ajusta tu foto</div>
        <div style={{ fontSize: 12, color: '#7f8ea3', marginBottom: 12 }}>Arrastra para mover, usa el control para acercar.</div>

        <div
          ref={viewportRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          style={{
            width: viewportSize.width,
            height: viewportSize.height,
            margin: '0 auto',
            overflow: 'hidden',
            borderRadius: 12,
            position: 'relative',
            background: '#eef1f5',
            cursor: 'grab',
            touchAction: 'none',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imgEl.src}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: scaledWidth,
              height: scaledHeight,
              transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          />
        </div>

        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => onZoomChange(Number(e.target.value))}
          style={{ width: '100%', marginTop: 14 }}
        />

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button className="bingo-button secondary" style={{ flex: 1 }} onClick={onCancel} disabled={processing}>
            Cancelar
          </button>
          <button className="bingo-button" style={{ flex: 1 }} onClick={confirm} disabled={processing}>
            {processing ? 'Procesando…' : 'Usar esta foto'}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(23,43,77,0.75)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 1000,
};
