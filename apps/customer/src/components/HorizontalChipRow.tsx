'use client';

import { useRef } from 'react';

/**
 * `.bingo-chip-row` with click-and-drag scrolling. The row's native scrollbar is hidden globally
 * (an ugly, large bar on desktop) — touch/trackpad swiping still works without it, but a plain
 * mouse has no other way to move a hidden-scrollbar row, so this restores that via pointer events.
 */
export default function HorizontalChipRow({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, startX: 0, startScroll: 0, moved: false });

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Touch/pen already scroll this row natively (overflow-x: auto) — only mice lack a way to
    // move it now that the scrollbar is hidden, so this only ever takes over for mouse input.
    if (e.pointerType !== 'mouse') return;
    const el = ref.current;
    if (!el) return;
    drag.current = { active: true, startX: e.clientX, startScroll: el.scrollLeft, moved: false };
    el.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el || !drag.current.active) return;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > 4) drag.current.moved = true;
    el.scrollLeft = drag.current.startScroll - dx;
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current.active) return;
    drag.current.active = false;
    ref.current?.releasePointerCapture(e.pointerId);
  }

  function onClickCapture(e: React.MouseEvent<HTMLDivElement>) {
    // Swallow the click that follows a real drag, so it doesn't also "select" whichever chip
    // the pointer happened to end up over.
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      drag.current.moved = false;
    }
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
