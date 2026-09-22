'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import RiderShell from '@/components/RiderShell';

// Same "keep it simple" hardcoded FAQ as Customer/Business, Rider-flavored questions.
const FAQS = [
  { q: '¿Cómo acepto una entrega?', a: 'Cuando estás disponible, verás las ofertas de entrega entrar en tiempo real — tienes unos segundos para aceptar o rechazar cada una.' },
  { q: '¿Cómo cambio mi estado a disponible?', a: 'En Inicio, usa el interruptor de disponibilidad. Solo recibes ofertas mientras estés en línea.' },
  { q: '¿Cuándo veo mis ganancias?', a: 'En Ganancias puedes ver el detalle por entrega y tus pagos ya procesados.' },
  { q: '¿Qué hago si el cliente no responde al llegar?', a: 'Sigue el protocolo dentro del detalle de la entrega — puedes reportar una incidencia desde ahí.' },
  { q: '¿Cómo actualizo mis documentos o vehículo?', a: 'En Perfil puedes agregar vehículos y subir documentos actualizados para revisión.' },
  { q: '¿Por qué mi cuenta está "En revisión"?', a: 'El equipo de BINGO+ revisa cada solicitud y documento antes de activarte — te avisamos apenas esté lista.' },
];

export default function HelpPage() {
  const router = useRouter();
  const [showOptions, setShowOptions] = useState(false);

  return (
    <RiderShell>
      <header className="bingo-header">
        <button className="bingo-button secondary small" style={{ marginBottom: 10 }} onClick={() => router.push('/profile')}>
          ← Perfil
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo%20para%20fondo%20osc.png" alt="BINGO+" className="bingo-logo-img" />
        <div className="bingo-header-sub" style={{ marginTop: 4 }}>Ayuda</div>
      </header>

      <div className="bingo-content">
        <h2 className="bingo-section-title">Preguntas frecuentes</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {FAQS.map((f) => (
            <div key={f.q} className="bingo-card">
              <div style={{ fontWeight: 700, fontSize: 14 }}>{f.q}</div>
              <div style={{ fontSize: 13, color: '#7f8ea3', marginTop: 6 }}>{f.a}</div>
            </div>
          ))}
        </div>

        <div className="bingo-card" style={{ marginTop: 16, background: 'var(--bingo-navy)', color: 'white' }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>¿Necesitas ser atendido por un agente?</div>
          {!showOptions ? (
            <button className="bingo-button" style={{ marginTop: 12 }} onClick={() => setShowOptions(true)}>
              Sí, necesito ayuda
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              <a href="/help/case" className="bingo-button secondary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                Soporte con la aplicación
              </a>
              <a href="/help/order" className="bingo-button secondary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                Soporte con un pedido
              </a>
            </div>
          )}
        </div>
      </div>
    </RiderShell>
  );
}
