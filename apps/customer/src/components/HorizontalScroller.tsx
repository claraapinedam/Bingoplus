'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Wraps a row of fixed-width cards in a swipeable horizontal scroller with dot pagination
 * instead of the browser's native scrollbar (which renders as a large, ugly bar on desktop).
 * The active dot is driven by real scroll position, not a fake/static indicator.
 */
export default function HorizontalScroller({
  itemCount,
  children,
}: {
  itemCount: number;
  children: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const drag = useRef({ pointerId: null as number | null, startX: 0, startScroll: 0, dragging: false });

  // Touch/pen already scroll this row natively (overflow-x: auto) — only mice lack a way to
  // move it now that the scrollbar is hidden, so this only ever takes over for mouse input.
  // Pointer capture is deferred until real movement is seen — capturing immediately on
  // pointerdown (before knowing it's a drag, not a click) breaks the native click on whatever
  // card sits under the cursor in some browsers.
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'mouse') return;
    const el = containerRef.current;
    if (!el) return;
    drag.current = { pointerId: e.pointerId, startX: e.clientX, startScroll: el.scrollLeft, dragging: false };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = containerRef.current;
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
    if (drag.current.dragging) containerRef.current?.releasePointerCapture(e.pointerId);
    drag.current.pointerId = null;
  }

  function onClickCapture(e: React.MouseEvent<HTMLDivElement>) {
    // Swallow the click that follows a real drag, so it doesn't also "open" whichever card the
    // pointer happened to end up over.
    if (drag.current.dragging) {
      e.preventDefault();
      e.stopPropagation();
    }
    drag.current.dragging = false;
  }

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function onScroll() {
      const maxScroll = el!.scrollWidth - el!.clientWidth;
      if (maxScroll <= 0) {
        setActiveIndex(0);
        return;
      }
      const ratio = el!.scrollLeft / maxScroll;
      setActiveIndex(Math.round(ratio * (itemCount - 1)));
    }

    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [itemCount]);

  return (
    <>
      <div
        className="bingo-h-scroll"
        ref={containerRef}
        style={{ cursor: 'grab' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>
      {itemCount > 1 && (
        <div className="bingo-scroll-dots">
          {Array.from({ length: itemCount }).map((_, i) => (
            <span key={i} className={`bingo-scroll-dot${i === activeIndex ? ' active' : ''}`} />
          ))}
        </div>
      )}
    </>
  );
}
