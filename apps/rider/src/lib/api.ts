'use client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const ACCESS_TOKEN_KEY = 'bingoplus_rider_access_token';
const REFRESH_TOKEN_KEY = 'bingoplus_rider_refresh_token';

export function saveTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/** Decodes the JWT payload without verifying it — verification already happened server-side; this
 * is only used client-side to read `roles` for UI routing (never trusted for authorization). */
export function decodeRoles(accessToken: string): string[] {
  try {
    const payload = JSON.parse(atob(accessToken.split('.')[1]));
    return Array.isArray(payload.roles) ? payload.roles : [];
  } catch {
    return [];
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

// Same pattern as apps/customer/src/lib/api.ts — short-lived access token (15 min), single
// in-flight refresh shared across concurrent 401s instead of each racing the rotating refresh token.
let refreshPromise: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) return false;
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return false;
        const body = await res.json();
        saveTokens(body.data.accessToken, body.data.refreshToken);
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/** Exposed so the app can force a token refresh right after POST /rider/apply — the new RIDER
 * role only lands in a freshly-issued token, not the one already in hand. */
export const forceRefreshSession = refreshSession;

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  _isRetry = false,
): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401 && !_isRetry && path !== '/auth/login' && path !== '/auth/refresh') {
    const refreshed = await refreshSession();
    if (refreshed) {
      return apiFetch<T>(path, options, true);
    }
    clearTokens();
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    throw new ApiError(401, 'SESSION_EXPIRED', 'Tu sesión expiró. Inicia sesión de nuevo.');
  }

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(
      res.status,
      body?.error?.code ?? 'UNKNOWN_ERROR',
      body?.error?.message ?? `Request failed with status ${res.status}`,
    );
  }

  return body.data as T;
}

interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
}

interface AuthResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export async function login(email: string, password: string) {
  const data = await apiFetch<AuthResult>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  saveTokens(data.accessToken, data.refreshToken);
  return data.user;
}

/** Creates the plain CUSTOMER account every rider needs before applying — the RIDER role itself
 * only gets attached once the full application (POST /rider/apply) is submitted and approved. */
export async function register(input: { email: string; password: string; firstName: string; lastName: string }) {
  const data = await apiFetch<AuthResult>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  saveTokens(data.accessToken, data.refreshToken);
  return data.user;
}

/** Uploads a single file (e.g. an ID photo) and returns the URL to pass back in the application
 * DTO — deliberately bypasses apiFetch's JSON Content-Type default, multipart sets its own. */
export async function uploadFile(file: File): Promise<{ url: string }> {
  const token = getAccessToken();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/uploads`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body?.error?.code ?? 'UPLOAD_FAILED', body?.error?.message ?? 'No se pudo subir el archivo.');
  }
  return body.data as { url: string };
}

/**
 * Real device geolocation via the standard Geolocation API — never fabricated (matches the
 * project's "no simular GPS real" rule, same as apps/customer's getUserLocation). Resolves null
 * on denial/timeout/unsupported rather than making up coordinates.
 */
export function getUserLocation(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => resolve(null),
      { timeout: 8000 },
    );
  });
}

/** Live position stream while the rider has an active delivery — same Geolocation API, watch mode. */
export function watchUserLocation(
  onUpdate: (coords: { latitude: number; longitude: number }) => void,
): () => void {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return () => undefined;
  const id = navigator.geolocation.watchPosition(
    (position) => onUpdate({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
    () => undefined,
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}
