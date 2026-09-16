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
      <div className="bingo-h-scroll" ref={containerRef}>
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
