export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function formatCurrency(amount: number, currency = 'USD', locale = 'es-EC'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface PaginationResult {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

export function resolvePagination({ page, pageSize }: PaginationParams): PaginationResult {
  const resolvedPage = Math.max(1, page ?? 1);
  const resolvedPageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize ?? DEFAULT_PAGE_SIZE));
  return {
    page: resolvedPage,
    pageSize: resolvedPageSize,
    skip: (resolvedPage - 1) * resolvedPageSize,
    take: resolvedPageSize,
  };
}

/** Haversine distance in kilometers — used for fallback distance display when PostGIS isn't queried directly. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return R * 2 * Math.asin(Math.sqrt(h));
}

export interface OpeningStatus {
  isOpenNow: boolean | null;
  /** "7:00 PM" — today's closing time, formatted for display; null when unknown or closed. */
  closesAt: string | null;
}

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function formatHour(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * Real open/closed status computed from a Business's own `openingHours` JSON — never a
 * fabricated schedule. Returns null fields when the business hasn't configured hours at all.
 */
export function getOpeningStatus(openingHours: unknown, now: Date = new Date()): OpeningStatus {
  if (!openingHours || typeof openingHours !== 'object') return { isOpenNow: null, closesAt: null };
  const todayHours = (openingHours as Record<string, { open?: string; close?: string } | undefined>)[
    WEEKDAY_KEYS[now.getDay()]
  ];
  if (!todayHours?.open || !todayHours?.close) return { isOpenNow: false, closesAt: null };

  const [openH, openM] = todayHours.open.split(':').map(Number);
  const [closeH, closeM] = todayHours.close.split(':').map(Number);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const isOpenNow = nowMinutes >= openH * 60 + openM && nowMinutes <= closeH * 60 + closeM;

  return { isOpenNow, closesAt: isOpenNow ? formatHour(todayHours.close) : null };
}

export type DateRangePreset = 'today' | 'last_7_days' | 'last_30_days' | 'this_month' | 'last_month' | 'custom';

export interface DateRangeParams {
  preset?: DateRangePreset;
  from?: string;
  to?: string;
}

export interface DateRange {
  from: Date;
  to: Date;
  preset: DateRangePreset;
}

/**
 * FASE 8 §1.3 — the one date-range resolver every Analytics endpoint (Business/Admin) shares, so
 * "Hoy"/"Últimos 7 días"/"Últimos 30 días"/"Este mes"/"Mes anterior"/custom range always mean the
 * exact same thing everywhere they're offered. `to` is always end-of-day inclusive.
 */
export function resolveDateRange(params: DateRangeParams, now: Date = new Date()): DateRange {
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  // A plain "YYYY-MM-DD" string parses as UTC midnight per the ISO 8601 spec, which
  // getFullYear()/getMonth()/getDate() would then read back in the server's local timezone —
  // silently shifting the calendar day whenever local time trails UTC. Forcing a local-time
  // component (same convention already used for booking/pet dates elsewhere) keeps "2026-01-01"
  // meaning the local calendar day 2026-01-01, never the day before.
  const parseLocalDate = (s: string) => new Date(s.includes('T') ? s : `${s}T00:00:00`);

  if (params.preset === 'custom' || (!params.preset && (params.from || params.to))) {
    // A date-only string ("2026-01-01") still means the whole calendar day — snapped to its
    // start/end. A string that already carries a time ("2026-01-01T14:00") means the caller picked
    // an actual hour, e.g. an admin filtering "today, 2pm to 6pm" — used exactly as given, never
    // silently widened back out to the full day.
    return {
      from: params.from ? (params.from.includes('T') ? parseLocalDate(params.from) : startOfDay(parseLocalDate(params.from))) : startOfDay(now),
      to: params.to ? (params.to.includes('T') ? parseLocalDate(params.to) : endOfDay(parseLocalDate(params.to))) : endOfDay(now),
      preset: 'custom',
    };
  }

  switch (params.preset) {
    case 'last_7_days': {
      const from = new Date(now);
      from.setDate(from.getDate() - 6);
      return { from: startOfDay(from), to: endOfDay(now), preset: 'last_7_days' };
    }
    case 'last_30_days': {
      const from = new Date(now);
      from.setDate(from.getDate() - 29);
      return { from: startOfDay(from), to: endOfDay(now), preset: 'last_30_days' };
    }
    case 'this_month': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: startOfDay(from), to: endOfDay(now), preset: 'this_month' };
    }
    case 'last_month': {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: startOfDay(from), to: endOfDay(to), preset: 'last_month' };
    }
    case 'today':
    default:
      return { from: startOfDay(now), to: endOfDay(now), preset: 'today' };
  }
}
