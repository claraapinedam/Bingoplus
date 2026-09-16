'use client';

export const BUSINESS_TERMS_SECTIONS: { title: string; body: string }[] = [
  {
    title: '1. Aceptación',
    body: 'Al enviar tu solicitud de registro como negocio en BINGO+, aceptas estos Términos y Condiciones. Tu negocio queda sujeto a revisión y aprobación del equipo de BINGO+ antes de operar en la plataforma.',
  },
  {
    title: '2. Registro y veracidad de la información',
    body: 'Te comprometes a proporcionar información veraz, completa y actualizada sobre tu negocio (razón social, identificación tributaria, dirección, contacto). BINGO+ puede solicitar documentación adicional para verificar tu identidad y actividad comercial antes de activar tu cuenta.',
  },
  {
    title: '3. Comisiones y tarifas',
    body: 'Si vendes productos a través del Marketplace ("Tiendas"), BINGO+ cobra una comisión sobre cada venta más la tarifa de envío correspondiente cuando se usa un repartidor de la plataforma. Si eliges aparecer en el Directorio, tu negocio paga una membresía periódica según el plan elegido, independientemente de si también vendes productos.',
  },
  {
    title: '4. Responsabilidades del negocio',
    body: 'Eres responsable de mantener actualizado tu catálogo, precios, inventario y horarios de atención, así como de cumplir con los pedidos aceptados dentro de los tiempos razonables. BINGO+ no es responsable por la calidad de los productos o servicios que ofreces.',
  },
  {
    title: '5. Suspensión y cancelación',
    body: 'BINGO+ puede suspender o cancelar tu cuenta ante incumplimiento de estos términos, información falsa, quejas reiteradas de clientes, o inactividad prolongada. Puedes solicitar la baja de tu negocio en cualquier momento contactando a soporte.',
  },
  {
    title: '6. Modificaciones',
    body: 'BINGO+ puede actualizar estos términos periódicamente. Los cambios relevantes se notificarán a través de la plataforma o por correo electrónico.',
  },
  {
    title: '7. Contacto',
    body: 'Para dudas sobre estos términos, escríbenos a soporte@bingoplus.com.',
  },
];

export const PRIVACY_TERMS_SECTIONS: { title: string; body: string }[] = [
  {
    title: '1. Datos que recopilamos',
    body: 'Recopilamos los datos que proporcionas al registrar tu negocio (nombre comercial, razón social, identificación tributaria, dirección, teléfono, correo electrónico) y los datos que se generan al usar la plataforma (pedidos, transacciones, ubicación del negocio, historial de calificaciones).',
  },
  {
    title: '2. Finalidad del tratamiento',
    body: 'Usamos estos datos para operar tu cuenta de negocio, procesar pedidos y pagos, calcular comisiones y facturación, comunicarnos contigo sobre tu cuenta, y mostrar tu perfil a clientes cuando corresponda (Marketplace y/o Directorio).',
  },
  {
    title: '3. Con quién compartimos tus datos',
    body: 'Compartimos únicamente los datos necesarios para operar el servicio: con clientes que interactúan con tu negocio (nombre comercial, dirección, horarios), con repartidores asignados a tus entregas, y con proveedores de pago para procesar transacciones. Nunca vendemos tus datos a terceros.',
  },
  {
    title: '4. Tus derechos',
    body: 'Puedes solicitar acceso, rectificación o eliminación de tus datos personales en cualquier momento contactando a soporte@bingoplus.com. Ten en cuenta que algunos datos deben conservarse mientras tu cuenta esté activa por motivos legales y de facturación.',
  },
  {
    title: '5. Seguridad',
    body: 'Aplicamos medidas técnicas y organizativas razonables para proteger tus datos contra acceso no autorizado, pérdida o alteración.',
  },
];

export default function TermsModal({
  title,
  sections,
  onClose,
}: {
  title: string;
  sections: { title: string; body: string }[];
  onClose: () => void;
}) {
  return (
    <div className="dashboard-modal-overlay" onClick={onClose}>
      <div className="dashboard-modal" onClick={(e) => e.stopPropagation()}>
        <div className="dashboard-modal-header">
          <span className="dashboard-modal-title">{title}</span>
          <button type="button" className="dashboard-modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="dashboard-modal-body">
          {sections.map((s) => (
            <div key={s.title}>
              <h4>{s.title}</h4>
              <p style={{ margin: 0 }}>{s.body}</p>
            </div>
          ))}
        </div>
        <div className="dashboard-modal-footer">
          <button type="button" className="bingo-button secondary small" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
