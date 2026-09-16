export default function RatingCell({ ratingAvg, reviewCount }: { ratingAvg: number; reviewCount: number }) {
  if (reviewCount === 0) {
    return <span style={{ color: '#7f8ea3', fontSize: 13 }}>Sin calificaciones</span>;
  }
  return (
    <span style={{ fontWeight: 600 }}>
      ★ {ratingAvg.toFixed(1)} <span style={{ color: '#7f8ea3', fontWeight: 400 }}>({reviewCount})</span>
    </span>
  );
}
