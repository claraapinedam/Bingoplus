'use client';

import { useState } from 'react';

/** Pet-friendly-place photo with a graceful fallback — used whenever `photoUrl` is missing OR
 * points to something that no longer loads (e.g. stale/invalid data), so the UI always shows a
 * clean placeholder instead of the browser's broken-image icon. */
export default function PlaceImage({
  src,
  alt,
  width,
  height,
  borderRadius = 6,
}: {
  src: string | null;
  alt: string;
  width: number | string;
  height: number;
  borderRadius?: number | string;
}) {
  const [broken, setBroken] = useState(false);

  if (!src || broken) {
    return (
      <div
        style={{
          width,
          height,
          borderRadius,
          background: '#eef1f5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: height * 0.4,
          color: '#9aa5b1',
          flexShrink: 0,
        }}
      >
        🐾
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      onError={() => setBroken(true)}
      style={{ width, height, objectFit: 'cover', borderRadius, flexShrink: 0 }}
    />
  );
}
