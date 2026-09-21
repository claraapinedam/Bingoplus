'use client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const ACCESS_TOKEN_KEY = 'bingoplus_business_access_token';
const REFRESH_TOKEN_KEY = 'bingoplus_business_refresh_token';
const ACTIVE_BUSINESS_KEY = 'bingoplus_business_active_id';

export function saveTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(ACTIVE_BUSINESS_KEY);
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/** Which of the user's businesses (BusinessUser membership) is currently being operated — a user
 * can own/manage more than one, every `me/business/:businessId/...` call needs to know which. */
export function getActiveBusinessId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACTIVE_BUSINESS_KEY);
}

export function setActiveBusinessId(id: string) {
  localStorage.setItem(ACTIVE_BUSINESS_KEY, id);
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

/** Fallback copy for the rare case the backend didn't send a structured error.message (a raw
 * infra-level failure — e.g. a cold start or a proxy hiccup — not one of our own thrown
 * exceptions, which already come back in Spanish). Never shown alongside a real backend message. */
function friendlyStatusMessage(status: number): string {
  if (status === 404) return 'No pudimos encontrar lo que buscabas. Intenta de nuevo.';
  if (status === 429) return 'Demasiados intentos. Espera un momento e intenta de nuevo.';
  if (status >= 500) return 'Ocurrió un error en el servidor. Intenta de nuevo en unos minutos.';
  return 'Ocurrió un error inesperado. Intenta de nuevo.';
}

// Same pattern as apps/customer and apps/rider — short-lived access token (15 min), single
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

async function apiFetchEnvelope(path: string, options: RequestInit = {}, _isRetry = false): Promise<any> {
  const token = getAccessToken();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar. Revisa tu conexión a internet e intenta de nuevo.');
  }

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
      body?.error?.message ?? friendlyStatusMessage(res.status),
    );
  }

  return body;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const body = await apiFetchEnvelope(path, options);
  return body.data as T;
}

/** Like `apiFetch`, but keeps the full `{data, meta}` envelope instead of discarding `meta` —
 * needed by paginated list endpoints (Orders, Products) whose real totals live in `meta.total`. */
export async function apiFetchPage<T>(path: string): Promise<{ data: T[]; meta: { page: number; pageSize: number; total: number } }> {
  return apiFetchEnvelope(path);
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
