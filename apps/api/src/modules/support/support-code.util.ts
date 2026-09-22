import { randomInt } from 'crypto';

/** Human-facing ticket number for a SupportCase, e.g. "SUP-000123" — same "friendly display
 * number, never the primary key" idea as generateOrderNumber (orders/order-number.util.ts), just
 * a flat sequential-looking 6-digit suffix instead of a date-based one since a support case has
 * no natural "day" grouping worth encoding. Collision risk is low (1e6 space) but callers should
 * still retry on a unique-constraint violation — see SupportCasesService.create. */
export function generateSupportCaseCode(): string {
  const suffix = String(randomInt(0, 1_000_000)).padStart(6, '0');
  return `SUP-${suffix}`;
}
