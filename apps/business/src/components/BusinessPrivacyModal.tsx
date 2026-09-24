'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import PrivacyDocument from './PrivacyDocument';

// The real "Política de Privacidad y Tratamiento de Datos Personales — Negocios BINGO+" document
// the owner supplied, replacing the old hardcoded PRIVACY_TERMS_SECTIONS placeholder prose that
// used to live in TermsModal. Mirrors BusinessTermsModal.tsx's structure exactly. The source
// document's version/date header line and the "☐" checkbox glyph inside clause 18 are
// intentionally left out, same reasoning as the Terms document: this app has no version-tracking
// mechanism for these documents (out of scope), and the checkbox in the form below is the real UI
// control, so restating it as text here would be redundant. The "1. RESPONSABLE DEL TRATAMIENTO"
// and "17. CONTACTO" sections' original table-cell layout (label/value on separate lines in the
// source .docx) is flattened here into "Label: value" single lines — these are not section
// headers, just body text, per PrivacyDocument's header regex.
//
// "{{razon_social_bingoplus}}"/"{{ruc_bingoplus}}" mirror the exact placeholder names used for the
// Terms document and the affiliation contract. "{{direccion_bingoplus}}"/
// "{{correo_privacidad_bingoplus}}" are this document's own two additional placeholders, resolved
// from the same GET /public/legal-info response (now also returning addressLine/privacyEmail).
const PRIVACY_TEXT = `POLÍTICA DE PRIVACIDAD Y TRATAMIENTO DE DATOS PERSONALES
NEGOCIOS BINGO+

1. RESPONSABLE DEL TRATAMIENTO
El responsable del tratamiento de los datos personales a que se refiere la presente Política es:
Responsable: {{razon_social_bingoplus}} (en adelante, "BINGO+")
RUC: {{ruc_bingoplus}}
Domicilio: {{direccion_bingoplus}}
Correo de privacidad: {{correo_privacidad_bingoplus}}

2. OBJETO Y ALCANCE
La presente Política tiene por objeto informar la forma en que BINGO+ recopila, utiliza, almacena, protege y, cuando corresponda, comunica los datos personales relacionados con los negocios registrados en la plataforma (en adelante, "EL NEGOCIO") y con sus representantes o responsables.
La presente Política se emite en cumplimiento de la Ley Orgánica de Protección de Datos Personales (en adelante, "LOPDP"), su Reglamento y la normativa expedida por la Superintendencia de Protección de Datos Personales. BINGO+ la mantendrá disponible de forma permanente en la plataforma y la actualizará para que sea coherente con los tratamientos de datos que efectivamente realiza.

3. DATOS QUE PODEMOS RECOPILAR
Dependiendo de la relación que mantenga con EL NEGOCIO, BINGO+ podrá recopilar las siguientes categorías de datos:

3.1. Datos del negocio
Razón social;
Nombre comercial;
Registro Único de Contribuyentes (RUC);
Dirección;
Información tributaria;
Información bancaria;
Teléfonos;
Correo electrónico;
Horarios; y,
Ubicación comercial.

3.2. Datos del representante o responsable
Nombre;
Número de identificación;
Cargo;
Teléfono;
Correo electrónico; y,
Información necesaria para verificar su identidad y facultades de representación.

3.3. Datos operativos
Información de productos;
Información de servicios;
Pedidos;
Transacciones;
Liquidaciones;
Historial de actividad; y,
Comunicaciones mantenidas con BINGO+.

3.4. Datos técnicos
Dirección IP;
Dispositivo;
Navegador;
Sistema operativo;
Registros de acceso;
Registros de eventos del sistema (logs); e,
Información de seguridad.

4. FINALIDADES DEL TRATAMIENTO
Los datos personales podrán ser tratados para las siguientes finalidades:
Registrar el negocio en la plataforma;
Verificar la información proporcionada;
Administrar la cuenta;
Publicar el perfil del negocio;
Gestionar productos;
Gestionar pedidos;
Gestionar servicios;
Procesar liquidaciones;
Prevenir el fraude;
Proteger la seguridad de la plataforma y de sus usuarios;
Brindar soporte;
Cumplir obligaciones legales;
Gestionar reclamaciones;
Mantener registros;
Mejorar la plataforma;
Enviar comunicaciones operativas; y,
Realizar análisis internos permitidos por la legislación.
El tratamiento se fundamenta, según la finalidad de que se trate, en la ejecución del Contrato de Afiliación y Uso de la Plataforma BINGO+ y de las medidas precontractuales solicitadas por EL NEGOCIO; en el cumplimiento de obligaciones legales de BINGO+; en el interés legítimo de BINGO+, particularmente para la prevención del fraude, la seguridad y la mejora de la plataforma; y en el consentimiento del titular, cuando este sea legalmente exigible.

5. DATOS BANCARIOS
Los datos bancarios serán utilizados exclusivamente para procesar las liquidaciones correspondientes a EL NEGOCIO. BINGO+ aplicará medidas de seguridad adecuadas para proteger esta información.

6. DATOS DE CLIENTES
Cuando EL NEGOCIO acceda a datos de clientes a través de BINGO+, deberá utilizarlos únicamente para las finalidades relacionadas con la operación correspondiente. EL NEGOCIO no podrá:
Venderlos;
Compartirlos con terceros no autorizados;
Utilizarlos para conformar bases de datos comerciales independientes;
Contactar a los clientes para finalidades ajenas a la operación; ni,
Incorporarlos a campañas propias sin contar con la base legal correspondiente.

7. RESPONSABILIDADES EN EL TRATAMIENTO
Dependiendo del tratamiento concreto, BINGO+ y EL NEGOCIO podrán actuar como:
Responsables independientes;
Corresponsables del tratamiento; o,
Responsable y encargado del tratamiento.
La calificación de cada Parte se determinará en función de quién decide sobre la finalidad y los medios del tratamiento, con independencia de la denominación que las Partes hayan dado contractualmente a su relación.
Cuando exista un encargo de tratamiento, este se regulará mediante un contrato escrito específico, en los términos exigidos por la LOPDP y su Reglamento.

8. ENCARGADOS Y PROVEEDORES
BINGO+ podrá contratar proveedores tecnológicos para servicios de:
Alojamiento (hosting);
Almacenamiento;
Pagos;
Comunicaciones;
Autenticación;
Analítica;
Seguridad;
Soporte; e,
Infraestructura tecnológica.
Cuando dichos proveedores traten datos personales por cuenta de BINGO+, estarán sujetos a las obligaciones que la legislación establece para los encargados del tratamiento o terceros, según corresponda.
Cuando alguno de estos proveedores se encuentre fuera del territorio ecuatoriano, la transferencia internacional de datos se realizará conforme a los requisitos y garantías previstos en la LOPDP.

9. SEGURIDAD
BINGO+ implementará medidas técnicas, organizativas, administrativas y físicas adecuadas, conforme a la LOPDP y a los principios de gestión de riesgos y de protección de datos desde el diseño y por defecto, destinadas a proteger los datos personales contra:
Acceso no autorizado;
Pérdida;
Destrucción;
Alteración;
Divulgación indebida; y,
Tratamiento no autorizado.

10. CONSERVACIÓN
BINGO+ conservará los datos personales durante el período necesario para:
Cumplir las finalidades informadas;
Mantener la relación contractual;
Cumplir obligaciones legales;
Atender reclamaciones; y,
Ejercer o defender derechos.
Una vez que no exista fundamento para conservar determinada información, BINGO+ procederá a su eliminación, anonimización o conservación bloqueada, según resulte legalmente procedente.

11. DERECHOS DEL TITULAR
El titular de los datos personales podrá ejercer los derechos reconocidos por la LOPDP, incluyendo los siguientes:
Acceso;
Rectificación y actualización;
Eliminación;
Oposición;
Suspensión del tratamiento;
Portabilidad; y,
Los demás derechos previstos en la legislación aplicable.
Las solicitudes podrán dirigirse al correo electrónico {{correo_privacidad_bingoplus}}, indicando la identidad del solicitante y el derecho que desea ejercer.
Sin perjuicio de lo anterior, el titular podrá presentar reclamos ante la Superintendencia de Protección de Datos Personales, conforme a la ley.

12. COOKIES Y TECNOLOGÍAS SIMILARES
BINGO+ podrá utilizar cookies y tecnologías similares con fines de:
Funcionamiento de la plataforma;
Seguridad;
Registro de preferencias;
Analítica; y,
Mejora de la experiencia de uso.
Cuando legalmente corresponda, BINGO+ solicitará las autorizaciones necesarias antes de su uso.

13. COMUNICACIONES
BINGO+ podrá enviar a EL NEGOCIO las comunicaciones necesarias relacionadas con:
El funcionamiento de la cuenta;
Pedidos;
Liquidaciones;
Seguridad;
Modificaciones contractuales;
Soporte; y,
Obligaciones legales.
Las comunicaciones de carácter comercial o promocional estarán sujetas a la base legal y a los mecanismos de consentimiento que correspondan.

14. TRANSFERENCIAS Y COMUNICACIONES DE DATOS
BINGO+ podrá comunicar datos personales a terceros cuando sea necesario para:
Prestar el servicio;
Cumplir obligaciones legales;
Procesar pagos;
Prevenir el fraude;
Atender requerimientos de autoridad competente; o,
Proteger sus derechos.
Las transferencias o comunicaciones de datos se realizarán conforme a las condiciones y bases legales aplicables.

15. INCIDENTES DE SEGURIDAD
En caso de producirse una vulneración de la seguridad que afecte datos personales, BINGO+ actuará conforme a las obligaciones de notificación y demás deberes previstos en la LOPDP, así como a sus procedimientos internos de gestión de incidentes.

16. CAMBIOS A ESTA POLÍTICA
BINGO+ podrá actualizar la presente Política cuando cambien:
Los tratamientos de datos realizados;
Las funcionalidades de la plataforma;
Los proveedores;
Las obligaciones legales; o,
Las medidas de seguridad.
La versión vigente estará disponible de forma permanente dentro de la plataforma.

17. CONTACTO
Para consultas relacionadas con privacidad y protección de datos personales:
Responsable: {{razon_social_bingoplus}}
Correo electrónico: {{correo_privacidad_bingoplus}}
Dirección: {{direccion_bingoplus}}

18. CONSTANCIA DE INFORMACIÓN Y ACEPTACIÓN
Al seleccionar la casilla "He leído y acepto la Política de Privacidad y Tratamiento de Datos Personales de BINGO+.", EL NEGOCIO declara haber sido informado del contenido de la presente Política, haberla leído y aceptado. BINGO+ conservará evidencia de la aceptación, incluyendo:
Usuario;
Fecha;
Hora;
Dirección IP;
Versión aceptada de la Política; e,
Identificación de EL NEGOCIO.
La contratación electrónica y los mensajes de datos tienen reconocimiento jurídico en el Ecuador, de conformidad con la Ley de Comercio Electrónico, Firmas Electrónicas y Mensajes de Datos, el Código de Comercio y demás legislación aplicable.`;

interface PublicLegalInfo {
  legalName: string;
  taxId: string;
  addressLine: string;
  privacyEmail: string | null;
}

function resolveText(legal: PublicLegalInfo): string {
  return PRIVACY_TEXT.replaceAll('{{razon_social_bingoplus}}', legal.legalName)
    .replaceAll('{{ruc_bingoplus}}', legal.taxId)
    .replaceAll('{{direccion_bingoplus}}', legal.addressLine)
    .replaceAll('{{correo_privacidad_bingoplus}}', legal.privacyEmail || '(no configurado)');
}

export default function BusinessPrivacyModal({ onClose }: { onClose: () => void }) {
  const [legal, setLegal] = useState<PublicLegalInfo | null | undefined>(undefined);

  useEffect(() => {
    apiFetch<PublicLegalInfo>('/public/legal-info').then(setLegal).catch(() => setLegal(null));
  }, []);

  return (
    <div className="dashboard-modal-overlay" onClick={onClose}>
      <div className="dashboard-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="dashboard-modal-header">
          <span className="dashboard-modal-title">Política de Privacidad y Tratamiento de Datos Personales</span>
          <button type="button" className="dashboard-modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="dashboard-modal-body">
          {legal === undefined && <p style={{ margin: 0, color: '#7f8ea3' }}>Cargando…</p>}
          {legal === null && (
            <p style={{ margin: 0, color: '#c0392b' }}>
              No pudimos cargar el documento en este momento. Intenta de nuevo más tarde.
            </p>
          )}
          {legal && <PrivacyDocument text={resolveText(legal)} />}
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
