'use client';

export default function RatingStars({
  value,
  onChange,
  readOnly,
  size = 22,
}: {
  value: number;
  onChange?: (rating: number) => void;
  readOnly?: boolean;
  size?: number;
}) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(n)}
          aria-label={`${n} estrellas`}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: readOnly ? 'default' : 'pointer',
            fontSize: size,
            lineHeight: 1,
            color: n <= value ? 'var(--bingo-warning)' : '#e0e4ea',
          }}
        >
          ★
        </button>
      ))}
    </div>
  );
}
