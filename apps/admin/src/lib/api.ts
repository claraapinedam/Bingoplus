'use client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const ACCESS_TOKEN_KEY = 'bingoplus_admin_access_token';
const REFRESH_TOKEN_KEY = 'bingoplus_admin_refresh_token';

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
 * is only used client-side to read `roles` for nav/route gating (never trusted for real
 * authorization, which is enforced by the backend's RolesGuard on every request regardless). */
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

// The access token is short-lived (15 min — see docs/10-security-architecture.md). Without this,
// every request fails with 401 once it expires and the admin is stuck looking logged-in but
// broken. Concurrent 401s share one in-flight refresh call instead of each racing the
// single-use, rotating refresh token against each other.
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

async function apiFetchEnvelope(path: string, options: RequestInit = {}, _isRetry = false): Promise<any> {
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
      return apiFetchEnvelope(path, options, true);
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

  return body;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const body = await apiFetchEnvelope(path, options);
  return body.data as T;
}

/** Like `apiFetch`, but keeps the full `{data, meta}` envelope instead of discarding `meta` —
 * needed by every paginated admin list endpoint (Orders, Products, Payments, ...) whose real
 * totals live in `meta.total`. */
export async function apiFetchPage<T>(path: string): Promise<{ data: T[]; meta: { page: number; pageSize: number; total: number } }> {
  return apiFetchEnvelope(path);
}

export async function login(email: string, password: string) {
  const data = await apiFetch<{
    user: { id: string; email: string; firstName: string; lastName: string; roles: string[] };
    accessToken: string;
    refreshToken: string;
  }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });

  const ADMIN_PANEL_ROLES = ['ADMIN', 'SUPER_ADMIN', 'USER'];
  if (!data.user.roles.some((r) => ADMIN_PANEL_ROLES.includes(r))) {
    throw new ApiError(403, 'NOT_ADMIN', 'This account does not have admin access.');
  }

  saveTokens(data.accessToken, data.refreshToken);
  return data.user;
}
