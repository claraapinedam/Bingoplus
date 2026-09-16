'use client';

import DashboardShell from '@/components/DashboardShell';

const FAQS = [
  { q: '¿Cómo acepto un pedido nuevo?', a: 'Ve a Pedidos, filtra por "Nuevos" y abre el pedido — el botón principal te lleva al siguiente paso (Aceptar → Preparar → Listo).' },
  { q: '¿Cómo agrego un producto?', a: 'En Productos, usa "+ Agregar producto". El stock inicial se define ahí; para ajustarlo después usa Inventario.' },
  { q: '¿Por qué no veo la sección de Cupones o Servicios?', a: 'Cada sección solo aparece si tu negocio tiene esa función habilitada. Revisa Configuración, o contacta a soporte si crees que falta alguna.' },
  { q: '¿Quién puede cambiar mi dirección o categoría?', a: 'Esos datos los administra el equipo de BINGO+ — escríbenos si necesitas actualizarlos.' },
];

function HelpContent() {
  return (
    <>
      <header className="dashboard-page-header">
        <div className="dashboard-page-title">Ayuda</div>
      </header>
      <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {FAQS.map((f) => (
          <div key={f.q} className="bingo-card">
            <div style={{ fontWeight: 700, fontSize: 14 }}>{f.q}</div>
            <div style={{ fontSize: 13, color: '#54617a', marginTop: 6 }}>{f.a}</div>
          </div>
        ))}
        <div className="bingo-card" style={{ background: 'var(--bingo-navy)', color: 'white' }}>
          <div style={{ fontWeight: 700 }}>¿No encontraste lo que buscabas?</div>
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>Escríbenos a soporte@bingoplus.com</div>
        </div>
      </div>
    </>
  );
}

export default function HelpPage() {
  return (
    <DashboardShell>
      <HelpContent />
    </DashboardShell>
  );
}
