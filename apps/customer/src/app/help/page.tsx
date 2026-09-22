'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import CustomerShell from '@/components/CustomerShell';
import BackButton from '@/components/BackButton';

// Kept intentionally simple — a small hardcoded FAQ (no admin-editable CMS, out of scope). Same
// idea as apps/business/src/app/help/page.tsx, just Customer-flavored questions.
const FAQS = [
  { q: '¿Cómo hago un pedido?', a: 'Elige una tienda, agrega productos al carrito y confirma tu dirección y forma de pago al finalizar la compra.' },
  { q: '¿Cómo sigo mi pedido en camino?', a: 'Ve a "Mis pedidos" y abre el pedido — ahí verás el estado y, si es delivery, la ubicación del repartidor en tiempo real.' },
  { q: '¿Puedo cancelar un pedido?', a: 'Solo mientras esté en estado "Creado" o "Pago pendiente". Una vez que el negocio lo confirma, contáctanos si necesitas cancelarlo.' },
  { q: '¿Cómo reservo un servicio (peluquería, veterinaria, etc.)?', a: 'Entra al negocio desde el Directorio, elige el servicio y un horario disponible — tu reserva queda en "Mis reservas".' },
  { q: '¿Qué hago si mi pedido llegó incompleto o dañado?', a: 'Cuéntanoslo por Soporte — puedes adjuntar una foto como evidencia y un agente revisará tu caso.' },
  { q: '¿Cómo cambio mi dirección de entrega?', a: 'En Perfil → Mis direcciones puedes agregar, editar o marcar una dirección como predeterminada.' },
  { q: '¿Cómo elimino mi cuenta?', a: 'Escríbenos por Soporte con la aplicación y procesamos la eliminación de tu cuenta.' },
];

export default function HelpPage() {
  const router = useRouter();
  const [showOptions, setShowOptions] = useState(false);

  return (
    <CustomerShell>
      <header className="bingo-header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo%20para%20fondo%20osc.png" alt="BINGO+" className="bingo-logo-img" style={{ display: 'block', marginBottom: 10 }} />
        <BackButton onClick={() => router.back()} light />
        <div className="bingo-header-sub">Ayuda</div>
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

        <a href="/help/cases" className="bingo-card" style={{ display: 'block', marginTop: 12, textDecoration: 'none' }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Mis casos de soporte</div>
          <div style={{ fontSize: 12, color: '#7f8ea3', marginTop: 2 }}>Revisa el estado y las respuestas a los casos que enviaste.</div>
        </a>
      </div>
    </CustomerShell>
  );
}
