'use client';

export const RIDER_TERMS_SECTIONS: { title: string; body: string }[] = [
  {
    title: '1. Aceptación',
    body: 'Al enviar tu solicitud como rider de BINGO+, aceptas estos Términos y Condiciones. Tu cuenta queda sujeta a revisión y aprobación del equipo de BINGO+ antes de poder recibir entregas.',
  },
  {
    title: '2. Veracidad de la información',
    body: 'Debes mantener actualizada tu información personal, de contacto, de identificación y de vehículo. BINGO+ puede solicitar documentación adicional para verificar tu identidad antes de activar tu cuenta.',
  },
  {
    title: '3. Entregas',
    body: 'Debes cumplir con las entregas aceptadas dentro de tiempos razonables y seguir las indicaciones de recogida y entrega de cada pedido.',
  },
  {
    title: '4. Suspensión y cancelación',
    body: 'BINGO+ puede suspender o rechazar tu cuenta ante información falsa, incumplimientos reiterados o inactividad prolongada.',
  },
  {
    title: '5. Contacto',
    body: 'Para dudas sobre estos términos, escríbenos a soporte@bingoplus.com.',
  },
];

export const RIDER_PRIVACY_SECTIONS: { title: string; body: string }[] = [
  {
    title: '1. Datos que recopilamos',
    body: 'Recopilamos los datos de esta solicitud: información personal, de contacto, fotos de identificación y selfie, información de vehículo e información de pago.',
  },
  {
    title: '2. Finalidad del tratamiento',
    body: 'Usamos estos datos para verificar tu identidad, evaluar tu solicitud, operar tu cuenta de rider y procesar el pago de tus entregas completadas.',
  },
  {
    title: '3. Con quién compartimos tus datos',
    body: 'No compartimos tus datos con terceros salvo lo necesario para procesar pagos o cumplir con la ley.',
  },
  {
    title: '4. Tus derechos',
    body: 'Puedes solicitar acceso, rectificación o eliminación de tus datos escribiendo a soporte@bingoplus.com.',
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
