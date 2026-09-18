'use client';

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

/** Dependency-free SVG donut — built by hand (stroke-dasharray per slice on stacked <circle>s)
 * specifically so the total can sit in the center, which off-the-shelf chart libs don't do
 * without extra plugin weight for what's otherwise two small charts. */
export default function DonutChart({
  slices,
  centerValue,
  centerLabel,
  size = 168,
  strokeWidth = 26,
}: {
  slices: DonutSlice[];
  centerValue: string | number;
  centerLabel: string;
  size?: number;
  strokeWidth?: number;
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const visible = slices.filter((s) => s.value > 0);

  let offset = 0;
  const arcs = visible.map((s) => {
    const fraction = total > 0 ? s.value / total : 0;
    const dash = fraction * circumference;
    const arc = { ...s, dash, dashOffset: -offset };
    offset += dash;
    return arc;
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {total === 0 ? (
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#eef1f5" strokeWidth={strokeWidth} />
          ) : (
            arcs.map((a) => (
              <circle
                key={a.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={a.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${a.dash} ${circumference - a.dash}`}
                strokeDashoffset={a.dashOffset}
              />
            ))
          )}
        </g>
        <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.19} fontWeight={800} fill="var(--bingo-navy)">
          {centerValue}
        </text>
        <text x="50%" y="65%" textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.075} fill="#7f8ea3">
          {centerLabel}
        </text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {slices.map((s) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ color: '#54617a' }}>{s.label}</span>
            <span style={{ fontWeight: 700, color: 'var(--bingo-navy)' }}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
