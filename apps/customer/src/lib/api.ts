'use client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const ACCESS_TOKEN_KEY = 'bingoplus_customer_access_token';
const REFRESH_TOKEN_KEY = 'bingoplus_customer_refresh_token';

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

// The access token is short-lived (15 min — see docs/10-security-architecture.md). Without this,
// every request fails with 401 once it expires and the user is stuck looking logged-in but
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

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  _isRetry = false,
): Promise<T> {
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
      body?.error?.message ?? friendlyStatusMessage(res.status),
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

export async function register(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  termsAccepted: boolean;
  privacyNoticeAccepted: boolean;
  marketingConsentAccepted?: boolean;
}) {
  const data = await apiFetch<AuthResult>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  saveTokens(data.accessToken, data.refreshToken);
  return data.user;
}

export async function forgotPassword(email: string) {
  await apiFetch<void>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, newPassword: string) {
  await apiFetch<void>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
}

export async function verifyEmail(email: string, code: string) {
  await apiFetch<void>('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  });
}

export async function resendVerificationEmail(email: string) {
  await apiFetch<void>('/auth/resend-verification-email', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

/** Uploads a single file (e.g. a pet-friendly-place photo) and returns the URL to pass back in a
 * DTO field — bypasses apiFetch's JSON Content-Type default, multipart sets its own.
 * Retries once against a refreshed token on 401, same as apiFetch — multi-step flows (crop modal,
 * then upload) can outlast the 15-minute access token before the request finally fires. */
export async function uploadFile(file: File, _isRetry = false): Promise<{ url: string }> {
  const token = getAccessToken();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/uploads`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });

  if (res.status === 401 && !_isRetry) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return uploadFile(file, true);
    }
    clearTokens();
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    throw new ApiError(401, 'SESSION_EXPIRED', 'Tu sesión expiró. Inicia sesión de nuevo.');
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body?.error?.code ?? 'UPLOAD_FAILED', body?.error?.message ?? 'No se pudo subir el archivo.');
  }
  return body.data as { url: string };
}

/**
 * Real device/browser location via the standard Geolocation API — resolves to `null` on denial,
 * timeout, or when unsupported, rather than ever fabricating coordinates (matches the project's
 * "no simular GPS real" rule). The marketplace ranking degrades gracefully without it.
 */
export function getUserLocation(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => resolve(null),
      { timeout: 5000 },
    );
  });
}
