'use client';

/** Plain back-navigation control — an arrow + label, no pill/button chrome, used at the top of
 * every detail page instead of the old "← Volver" secondary button. */
export default function BackButton({
  onClick,
  href,
  label = 'Volver',
  style,
}: {
  onClick?: () => void;
  href?: string;
  label?: string;
  style?: React.CSSProperties;
}) {
  const content = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="var(--bingo-teal)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 12H5" />
        <path d="M11 18l-6-6 6-6" />
      </svg>
      <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--bingo-navy)' }}>{label}</span>
    </span>
  );

  const sharedStyle: React.CSSProperties = {
    display: 'inline-flex',
    background: 'none',
    border: 'none',
    padding: 0,
    marginBottom: 16,
    cursor: 'pointer',
    textDecoration: 'none',
    ...style,
  };

  if (href) {
    return (
      <a href={href} style={sharedStyle}>
        {content}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} style={sharedStyle}>
      {content}
    </button>
  );
}
