type IconName = 'view' | 'approve' | 'reject' | 'pause' | 'star';

const PATHS: Record<IconName, React.ReactNode> = {
  view: (
    <>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  approve: <path d="M5 13l4 4L19 7" />,
  reject: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </>
  ),
  pause: (
    <>
      <path d="M9 6v12" />
      <path d="M15 6v12" />
    </>
  ),
  star: <path d="M12 3l2.6 5.9 6.4.6-4.8 4.3 1.4 6.3L12 17l-5.6 3.1 1.4-6.3-4.8-4.3 6.4-.6L12 3Z" />,
};

const VARIANTS: Record<IconName, string> = {
  view: 'view',
  approve: 'approve',
  reject: 'reject',
  pause: 'neutral',
  star: 'neutral',
};

/** Circular icon-only action for table "Acciones" columns — Ver/Aprobar/Rechazar and friends,
 * without the label width a text pill costs. `href` renders an anchor, otherwise a button. */
export default function IconButton({
  icon,
  label,
  href,
  onClick,
  disabled,
}: {
  icon: IconName;
  label: string;
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
}) {
  const svg = (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[icon]}
    </svg>
  );

  if (href) {
    return (
      <a href={href} title={label} aria-label={label} className={`bingo-icon-btn ${VARIANTS[icon]}`} onClick={onClick}>
        {svg}
      </a>
    );
  }

  return (
    <button type="button" title={label} aria-label={label} className={`bingo-icon-btn ${VARIANTS[icon]}`} onClick={onClick} disabled={disabled}>
      {svg}
    </button>
  );
}
