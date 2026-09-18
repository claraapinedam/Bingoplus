'use client';

import { useRef } from 'react';

/**
 * `.bingo-chip-row` with click-and-drag scrolling. The row's native scrollbar is hidden globally
 * (an ugly, large bar on desktop) — touch/trackpad swiping still works without it, but a plain
 * mouse has no other way to move a hidden-scrollbar row, so this restores that via pointer events.
 *
 * Pointer capture is deliberately deferred until the pointer has actually moved past a small
 * threshold — capturing immediately on pointerdown (before knowing it's a drag, not a click)
 * breaks the native click on whatever chip/card sits under the cursor in some browsers.
 */
export default function HorizontalChipRow({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ pointerId: null as number | null, startX: 0, startScroll: 0, dragging: false });

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Touch/pen already scroll this row natively (overflow-x: auto) — only mice lack a way to
    // move it now that the scrollbar is hidden, so this only ever takes over for mouse input.
    if (e.pointerType !== 'mouse') return;
    const el = ref.current;
    if (!el) return;
    drag.current = { pointerId: e.pointerId, startX: e.clientX, startScroll: el.scrollLeft, dragging: false };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el || drag.current.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.current.startX;
    if (!drag.current.dragging) {
      if (Math.abs(dx) < 4) return;
      drag.current.dragging = true;
      el.setPointerCapture(e.pointerId);
    }
    el.scrollLeft = drag.current.startScroll - dx;
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (drag.current.pointerId !== e.pointerId) return;
    if (drag.current.dragging) ref.current?.releasePointerCapture(e.pointerId);
    drag.current.pointerId = null;
  }

  function onClickCapture(e: React.MouseEvent<HTMLDivElement>) {
    // Swallow the click that follows a real drag, so it doesn't also "select" whichever chip
    // the pointer happened to end up over.
    if (drag.current.dragging) {
      e.preventDefault();
      e.stopPropagation();
    }
    drag.current.dragging = false;
  }

  return (
    <div
      ref={ref}
      className="bingo-chip-row"
      style={{ cursor: 'grab', ...style }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      onClickCapture={onClickCapture}
    >
      {children}
    </div>
  );
}
