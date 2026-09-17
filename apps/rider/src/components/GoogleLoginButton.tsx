'use client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

/** Full-page navigation to the backend's OAuth entry point (GET /auth/google) — not a fetch, this
 * has to leave the SPA so the browser can complete Google's own consent redirect dance. `app`
 * round-trips through Google's `state` param so the shared callback knows which of the 4 apps to
 * send the browser back to (see GoogleAuthGuard/AuthController.googleCallback). */
export default function GoogleLoginButton({ app }: { app: 'customer' | 'rider' | 'business' }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0' }}>
        <div style={{ flex: 1, height: 1, background: '#e0e4ea' }} />
        <span style={{ fontSize: 12, color: '#9aa5b1' }}>o continúa con</span>
        <div style={{ flex: 1, height: 1, background: '#e0e4ea' }} />
      </div>
      <a
        href={`${API_URL}/auth/google?app=${app}`}
        aria-label="Continuar con Google"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid #e0e4ea',
          borderRadius: 999,
          padding: '11px 0',
          background: 'white',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.5h-1.9V20.4H24v7.2h11.3c-1.6 4.7-6.1 8.1-11.3 8.1-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.1-5.1C34 6.5 29.3 4.5 24 4.5 13.5 4.5 5 13 5 23.5S13.5 42.5 24 42.5 43 34 43 23.5c0-1-.1-1.9-.4-3z" />
          <path fill="#FF3D00" d="m6.3 14.7 5.9 4.3C13.9 15.3 18.6 12.5 24 12.5c3.1 0 5.9 1.2 8 3.1l5.1-5.1C34 6.5 29.3 4.5 24 4.5c-7.7 0-14.3 4.4-17.7 10.8z" />
          <path fill="#4CAF50" d="M24 42.5c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.4-4.6 2.2-7.2 2.2-5.2 0-9.6-3.5-11.2-8.3l-6.1 4.7C10 38 16.5 42.5 24 42.5z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20.4H24v7.2h11.3c-.8 2.3-2.2 4.2-4.2 5.6l6.2 5.2C40.5 35.9 43 30.5 43 23.5c0-1-.1-1.9-.4-3z" />
        </svg>
      </a>
    </div>
  );
}
