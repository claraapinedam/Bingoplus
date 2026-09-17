'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { saveTokens } from '@/lib/api';

/** GET /auth/google/callback (backend) redirects the browser here with tokens in the query
 * string once Google confirms the user — this page's only job is to store them and hand off,
 * same as a normal email/password login (which also lands on /select-business). */
function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const accessToken = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');
    if (accessToken && refreshToken) {
      saveTokens(accessToken, refreshToken);
      router.replace('/select-business');
    } else {
      router.replace('/login');
    }
  }, [router, searchParams]);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#7f8ea3', fontSize: 14 }}>Iniciando sesión…</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <AuthCallbackContent />
    </Suspense>
  );
}
