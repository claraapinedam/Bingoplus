// DAYCARE/BOARDING are booked by check-in/check-out date range, not a time-of-day slot — mirrors
// the backend's DAY_UNIT_TYPES (see BookingsService) and the booking flow's own DAY_RANGE_TYPES
// (apps/customer/src/app/services/[id]/book/page.tsx). Showing the raw "1440 min" durationMinutes
// value for these two types is confusing right before a customer picks a multi-day range, so we
// derive a day count from it instead (same "1 unit = X minutes" convention already used elsewhere)
// rather than adding a new schema field.
const DAY_RANGE_SERVICE_TYPES = ['DAYCARE', 'BOARDING'];

export function isDayRangeServiceType(type: string): boolean {
  return DAY_RANGE_SERVICE_TYPES.includes(type);
}

/** "1440 min" -> "1 día" / "2880 min" -> "2 días". Every other service type keeps showing the raw
 * minute count exactly as before. */
export function formatServiceDuration(type: string, durationMinutes: number): string {
  if (!isDayRangeServiceType(type)) return `${durationMinutes} min`;
  const days = Math.max(1, Math.round(durationMinutes / 1440));
  return `${days} ${days === 1 ? 'día' : 'días'}`;
}
