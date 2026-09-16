'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CustomerShell from '@/components/CustomerShell';
import { apiFetch, clearTokens } from '@/lib/api';

interface Profile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    apiFetch<Profile>('/me').then(setProfile).catch(() => undefined);
  }, []);

  function logout() {
    clearTokens();
    router.push('/login');
  }

  return (
    <CustomerShell>
      <header className="bingo-header">
        <div className="bingo-logo" style={{ fontSize: 18 }}>
          Perfil
        </div>
      </header>

      <div className="bingo-content">
        {profile && (
          <div className="bingo-card">
            <div style={{ fontWeight: 800, fontSize: 16 }}>
              {profile.firstName} {profile.lastName}
            </div>
            <div style={{ color: '#7f8ea3', fontSize: 13, marginTop: 4 }}>{profile.email}</div>
            {profile.phone && <div style={{ color: '#7f8ea3', fontSize: 13 }}>{profile.phone}</div>}
          </div>
        )}

        <a href="/notifications" className="bingo-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>🔔 Notificaciones</span>
          <span style={{ color: '#9aa5b1' }}>→</span>
        </a>

        <a href="/orders" className="bingo-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>📦 Mis pedidos</span>
          <span style={{ color: '#9aa5b1' }}>→</span>
        </a>

        <a href="/bookings" className="bingo-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>📅 Mis reservas</span>
          <span style={{ color: '#9aa5b1' }}>→</span>
        </a>

        <a href="/addresses" className="bingo-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>📍 Mis direcciones</span>
          <span style={{ color: '#9aa5b1' }}>→</span>
        </a>

        <a href="/pets" className="bingo-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>🐾 Mis mascotas</span>
          <span style={{ color: '#9aa5b1' }}>→</span>
        </a>

        <button className="bingo-button" style={{ marginTop: 24, background: 'var(--bingo-error)' }} onClick={logout}>
          Cerrar sesión
        </button>
      </div>
    </CustomerShell>
  );
}
