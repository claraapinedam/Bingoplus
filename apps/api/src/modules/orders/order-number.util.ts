import { randomInt } from 'crypto';

/** §27: a friendly display number — never the primary key. Collision risk is astronomically low (1e6 space) but the caller should still retry on a unique-constraint violation. */
export function generateOrderNumber(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const suffix = String(randomInt(0, 1_000_000)).padStart(6, '0');
  return `BGO-${y}${m}${d}-${suffix}`;
}
