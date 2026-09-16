export default function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="bingo-empty">
      <div className="bingo-empty-title">{title}</div>
      {subtitle && <div>{subtitle}</div>}
    </div>
  );
}
