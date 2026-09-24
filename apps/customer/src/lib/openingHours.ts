/**
 * Helpers for rendering a business's weekly opening hours as a compact,
 * customer-facing list — grouping consecutive days with identical hours
 * into a single "Día1 a Día2: HH:MM – HH:MM" row instead of one line per day.
 *
 * Pure/display-only: does not touch how openingHours is stored or computed
 * server-side (see getOpeningStatus in @bingoplus/utils for "abierto ahora").
 */

export type OpeningHours = Record<string, { open: string; close: string }>;

export interface OpeningHoursRow {
  label: string;
}

/** Real Monday → Sunday order, independent of object key insertion order. */
export const WEEKDAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export const WEEKDAY_LABELS: Record<string, string> = {
  mon: 'Lunes',
  tue: 'Martes',
  wed: 'Miércoles',
  thu: 'Jueves',
  fri: 'Viernes',
  sat: 'Sábado',
  sun: 'Domingo',
};

/** Lowercases the first letter of a Spanish weekday label, e.g. "Viernes" -> "viernes". */
function lowerFirst(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/**
 * Groups a business's weekly opening hours into compact display rows.
 *
 * - Iterates in real weekday order (Monday -> Sunday), not object-key order.
 * - A day with no entry (closed) is omitted entirely and breaks any run of
 *   otherwise-identical hours around it — a closed day must never be implied
 *   as open by a spoken range like "Lunes a viernes".
 * - Consecutive open days sharing the exact same { open, close } collapse to
 *   "Día1 a Día2: HH:MM – HH:MM"; a run of 1 stays "Día: HH:MM – HH:MM".
 */
export function groupOpeningHours(openingHours: OpeningHours | null | undefined): OpeningHoursRow[] {
  if (!openingHours) return [];

  const rows: OpeningHoursRow[] = [];
  let runStartIdx: number | null = null;
  let runEndIdx: number | null = null;
  let runHours: { open: string; close: string } | null = null;

  function flushRun() {
    if (runStartIdx === null || runEndIdx === null || !runHours) return;
    const startLabel = WEEKDAY_LABELS[WEEKDAY_ORDER[runStartIdx]];
    const endLabel = WEEKDAY_LABELS[WEEKDAY_ORDER[runEndIdx]];
    const timeRange = `${runHours.open} – ${runHours.close}`;
    if (runStartIdx === runEndIdx) {
      rows.push({ label: `${startLabel}: ${timeRange}` });
    } else {
      rows.push({ label: `${startLabel} a ${lowerFirst(endLabel)}: ${timeRange}` });
    }
    runStartIdx = null;
    runEndIdx = null;
    runHours = null;
  }

  for (let i = 0; i < WEEKDAY_ORDER.length; i++) {
    const dayKey = WEEKDAY_ORDER[i];
    const hours = openingHours[dayKey];

    if (!hours) {
      // Closed day: end any in-progress run, and it stays ended (gap).
      flushRun();
      continue;
    }

    const sameAsRun =
      runHours !== null && runEndIdx === i - 1 && runHours.open === hours.open && runHours.close === hours.close;

    if (sameAsRun) {
      runEndIdx = i;
    } else {
      flushRun();
      runStartIdx = i;
      runEndIdx = i;
      runHours = hours;
    }
  }
  flushRun();

  return rows;
}
