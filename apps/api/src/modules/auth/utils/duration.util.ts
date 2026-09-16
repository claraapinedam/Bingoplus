const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/** Parses simple durations like "15m", "1h", "30d" into milliseconds. */
export function parseDurationMs(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid duration format: "${value}" (expected e.g. "15m", "1h", "30d")`);
  }
  const [, amount, unit] = match;
  return Number(amount) * UNIT_MS[unit];
}
