'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import PrivacyDocument from './PrivacyDocument';

// The real "Política de Privacidad y Tratamiento de Datos Personales — Riders BINGO+" document the
// owner supplied (apps/rider/public/Politica_Privacidad_Riders_BINGO+.docx), replacing the old
// hardcoded RIDER_PRIVACY_SECTIONS placeholder prose that used to live in TermsModal.tsx. Mirrors
// RiderTermsModal.tsx's structure and apps/business/src/components/BusinessPrivacyModal.tsx's
// pattern. The source document's version/date header line and the "☐" checkbox glyph inside
// clause 22 are intentionally left out, same reasoning as the other legal documents in this
// project: this app has no version-tracking mechanism (out of scope), and the checkbox in the form
// below is the real UI control, so restating it as text here would be redundant.
//
// "{{razon_social_bingoplus}}"/"{{ruc_bingoplus}}"/"{{direccion_bingoplus}}"/
// "{{correo_privacidad_bingoplus}}" mirror the exact placeholder names used for the business
// Privacy document, resolved from the same GET /public/legal-info response
// (legalName/taxId/addressLine/privacyEmail). The source .docx had a separate
// "[CANAL DE SOLICITUDES DE DATOS]" placeholder alongside "[CORREO DE PRIVACIDAD BINGO+]" — there
// is no distinct backend field for that beyond privacyEmail, so both occurrences of
// "{{correo_privacidad_bingoplus}}" below (sections 1.1 and 15.1) intentionally resolve to the
// same privacyEmail value.
const RIDER_PRIVACY_TEXT = `POLÍTICA DE PRIVACIDAD Y TRATAMIENTO DE DATOS PERSONALES
RIDERS BINGO+

PREÁMBULO
BINGO+ reconoce la importancia de la protección de los datos personales de las personas que utilizan la plataforma como Riders y establece, mediante la presente Política de Privacidad y Tratamiento de Datos Personales (en adelante, la "Política"), los criterios aplicables al tratamiento de dicha información, de conformidad con la Ley Orgánica de Protección de Datos Personales (en adelante, "LOPDP"), su Reglamento y demás normativa aplicable.
La presente Política explica qué información puede ser tratada, para qué finalidades, cómo puede utilizarse, con quién puede ser compartida y cuáles son los mecanismos disponibles para ejercer los derechos reconocidos por la normativa aplicable.

1. RESPONSABLE DEL TRATAMIENTO
1.1. El responsable del tratamiento de los datos personales es:
Razón social: {{razon_social_bingoplus}}
RUC: {{ruc_bingoplus}}
Domicilio: {{direccion_bingoplus}}
Correo electrónico de contacto: {{correo_privacidad_bingoplus}}
Canal para solicitudes de protección de datos: {{correo_privacidad_bingoplus}}
1.2. Para efectos de la presente Política, el responsable del tratamiento se denominará "BINGO+".

2. ALCANCE
2.1. La presente Política aplica a los datos personales proporcionados por las personas que soliciten registrarse, sean aprobadas o utilicen la plataforma como Riders.
2.2. También aplica a la información generada durante la utilización de la plataforma, incluyendo la relacionada con pedidos, entregas, ubicación, actividad de la cuenta e interacciones con BINGO+.

3. DATOS PERSONALES QUE PUEDEN SER TRATADOS
Dependiendo del proceso y de las funcionalidades utilizadas, BINGO+ podrá tratar las siguientes categorías de datos:
3.1. Datos de identificación: Nombre, número de identificación y datos necesarios para verificar la identidad.
3.2. Datos de contacto: Teléfono, correo electrónico y otros medios de contacto.
3.3. Datos relacionados con la actividad como Rider: Información de registro, estado de la cuenta, pedidos aceptados, entregas realizadas, cancelaciones e incidencias.
3.4. Datos relacionados con el vehículo: Tipo de vehículo, placa y documentación o información necesaria para verificar los requisitos aplicables.
3.5. Datos de ubicación: Ubicación del dispositivo durante las operaciones en las que dicha información sea necesaria.
3.6. Datos económicos: Información necesaria para realizar pagos al Rider, incluyendo datos bancarios o de medios de pago.
3.7. Datos de comunicaciones: Información proporcionada al comunicarse con soporte o mediante los canales habilitados por BINGO+.
3.8. Datos tecnológicos: Información relacionada con el dispositivo, sistema operativo, identificadores técnicos, registros de actividad y eventos necesarios para la seguridad y el funcionamiento de la plataforma.

4. DATOS DE TERCEROS
4.1. Durante una entrega, el Rider podrá visualizar determinados datos personales de los clientes.
4.2. Dichos datos podrán incluir, según sea necesario:
Nombre;
Teléfono;
Dirección;
Ubicación; e,
Instrucciones relacionadas con la entrega.
4.3. Esta información será proporcionada exclusivamente en la medida necesaria para ejecutar la operación.
4.4. El Rider deberá mantener la confidencialidad de dicha información y utilizarla únicamente para la finalidad autorizada.

5. FINALIDADES DEL TRATAMIENTO
BINGO+ podrá tratar los datos personales del Rider para las siguientes finalidades:
5.1. Gestionar el registro y la aprobación de Riders.
5.2. Verificar la identidad y los requisitos de acceso.
5.3. Administrar la cuenta del Rider.
5.4. Asignar y gestionar pedidos.
5.5. Facilitar la comunicación entre el Rider, el cliente y el negocio cuando sea necesaria para una entrega.
5.6. Proporcionar información de navegación, ubicación y seguimiento.
5.7. Confirmar y documentar entregas.
5.8. Procesar pagos, liquidaciones y obligaciones administrativas.
5.9. Gestionar reclamos, incidentes, pérdidas, daños o disputas relacionadas con las entregas.
5.10. Detectar y prevenir fraude, abuso, suplantación, manipulación de la plataforma y otras actividades indebidas.
5.11. Proteger la seguridad de los usuarios, Riders, negocios y de la plataforma.
5.12. Cumplir obligaciones legales y atender requerimientos de autoridades competentes.
5.13. Generar estadísticas e indicadores operativos.
5.14. Mejorar las funcionalidades, procesos y servicios de BINGO+.

6. GEOLOCALIZACIÓN
6.1. BINGO+ podrá tratar datos de ubicación del Rider cuando sea necesario para las funcionalidades relacionadas con las entregas.
6.2. La ubicación podrá utilizarse para:
Identificar Riders disponibles;
Asignar pedidos;
Facilitar la navegación;
Calcular o estimar tiempos de llegada;
Permitir el seguimiento del pedido;
Verificar eventos relacionados con la entrega;
Investigar incidentes o reclamos; y,
Mejorar la seguridad y la operación de la plataforma.
6.3. La recopilación de la ubicación se realizará conforme a las funcionalidades habilitadas y a las condiciones informadas al Rider.
6.4. BINGO+ limitará el tratamiento de la ubicación a lo necesario para las finalidades correspondientes.

7. BASES Y CONDICIONES DEL TRATAMIENTO
7.1. BINGO+ tratará los datos personales de acuerdo con las bases de legitimación aplicables conforme a la LOPDP.
7.2. Dependiendo de la finalidad, el tratamiento podrá sustentarse en la ejecución de la relación contractual, el cumplimiento de obligaciones legales, el interés legítimo de BINGO+ cuando sea jurídicamente aplicable, el consentimiento del titular u otras bases legalmente reconocidas.
7.3. Cuando el consentimiento sea necesario, será solicitado de forma previa mediante los mecanismos correspondientes.

8. PRINCIPIOS DE PROTECCIÓN
BINGO+ velará por que el tratamiento de datos personales observe, según corresponda, los siguientes principios:
8.1. Legalidad.
8.2. Transparencia.
8.3. Finalidad.
8.4. Minimización.
8.5. Proporcionalidad.
8.6. Confidencialidad.
8.7. Seguridad.
8.8. Responsabilidad proactiva.

9. CONSERVACIÓN DE LA INFORMACIÓN
9.1. BINGO+ conservará los datos personales durante el tiempo necesario para cumplir las finalidades para las cuales fueron tratados.
9.2. Determinada información podrá conservarse durante períodos adicionales cuando exista una obligación legal, contractual, contable o tributaria, o razones de seguridad, prevención de fraude o defensa de derechos que lo justifiquen.
9.3. Una vez que la información deje de ser necesaria y no exista una obligación legítima de conservación, BINGO+ procederá a su eliminación, anonimización o tratamiento conforme a la normativa aplicable.

10. COMUNICACIÓN DE DATOS A TERCEROS
10.1. BINGO+ podrá compartir información personal cuando sea necesario para prestar los servicios de la plataforma.
10.2. Dependiendo de la operación, determinados datos podrán ser comunicados al cliente, al negocio, a proveedores tecnológicos, proveedores de servicios de pago, proveedores de infraestructura, servicios de mapas, soporte u otros terceros que participen legítimamente en la operación.
10.3. La información compartida se limitará a la necesaria para la finalidad correspondiente.
10.4. BINGO+ podrá comunicar información cuando exista una obligación legal o un requerimiento de autoridad competente.

11. ENCARGADOS Y PROVEEDORES
11.1. BINGO+ podrá contratar proveedores que traten datos personales por cuenta de BINGO+, en calidad de encargados del tratamiento.
11.2. Dichos proveedores deberán tratar la información conforme a las instrucciones, finalidades y condiciones establecidas por BINGO+ y la normativa aplicable.
11.3. BINGO+ suscribirá con dichos proveedores los contratos exigidos por la LOPDP e implementará medidas de seguridad adecuadas para el tratamiento realizado por terceros.

12. SEGURIDAD DE LOS DATOS
12.1. BINGO+ implementará medidas técnicas, organizativas y administrativas apropiadas para proteger los datos personales.
12.2. Estas medidas estarán orientadas a reducir los riesgos de acceso no autorizado, pérdida, alteración, destrucción, divulgación indebida u otros incidentes.
12.3. Ningún sistema tecnológico puede garantizar una seguridad absoluta; por ello, BINGO+ mantendrá medidas de prevención, detección y respuesta acordes con los riesgos identificados.

13. RESPONSABILIDADES DEL RIDER SOBRE DATOS DE CLIENTES
Cuando el Rider tenga acceso a datos personales de clientes:
13.1. Deberá utilizarlos exclusivamente para realizar la entrega.
13.2. No podrá fotografiarlos, copiarlos, almacenarlos ni registrarlos fuera de los mecanismos autorizados por BINGO+.
13.3. No podrá compartirlos con terceros.
13.4. No podrá utilizarlos para publicidad, ventas, contacto personal u otros fines.
13.5. Deberá informar inmediatamente a BINGO+ cualquier pérdida, acceso no autorizado, divulgación o incidente relacionado con dichos datos.

14. DERECHOS DEL TITULAR
El Rider podrá ejercer los derechos reconocidos por la LOPDP, incluyendo, según corresponda, los derechos de:
14.1. Acceso.
14.2. Rectificación y actualización.
14.3. Eliminación.
14.4. Oposición.
14.5. Portabilidad, cuando resulte aplicable.
14.6. Suspensión del tratamiento, cuando corresponda.
14.7. No ser objeto de decisiones basadas única o parcialmente en valoraciones automatizadas que produzcan efectos jurídicos o le afecten significativamente, en los términos previstos por la LOPDP.
14.8. Los demás derechos reconocidos por la normativa aplicable.
Sin perjuicio de lo anterior, el Rider podrá presentar reclamos ante la Superintendencia de Protección de Datos Personales, conforme a la ley.

15. EJERCICIO DE DERECHOS
15.1. El Rider podrá presentar solicitudes relacionadas con sus datos personales mediante:
Correo electrónico: {{correo_privacidad_bingoplus}}
Canal: {{correo_privacidad_bingoplus}}
Dirección: {{direccion_bingoplus}}
15.2. BINGO+ podrá solicitar la información razonablemente necesaria para verificar la identidad del solicitante.
15.3. Las solicitudes serán atendidas conforme a los plazos y procedimientos establecidos por la legislación aplicable.

16. INCIDENTES DE SEGURIDAD
16.1. BINGO+ contará con mecanismos para identificar y gestionar incidentes relacionados con datos personales.
16.2. Cuando corresponda legalmente, BINGO+ realizará las notificaciones pertinentes ante la Superintendencia de Protección de Datos Personales y/o los titulares afectados.
16.3. El Rider deberá informar inmediatamente cualquier incidente que conozca relacionado con información personal a la que haya tenido acceso mediante la plataforma.

17. TRANSFERENCIAS INTERNACIONALES Y PROVEEDORES TECNOLÓGICOS
17.1. BINGO+ podrá utilizar proveedores tecnológicos ubicados dentro o fuera del Ecuador cuando resulte necesario para operar la plataforma.
17.2. Cuando una transferencia o comunicación internacional de datos personales sea aplicable, BINGO+ observará los requisitos y garantías establecidos por la LOPDP.

18. COOKIES Y TECNOLOGÍAS SIMILARES
18.1. Las interfaces web de BINGO+ podrán utilizar cookies, identificadores técnicos u otras tecnologías necesarias para el funcionamiento, la seguridad, el análisis y la mejora de los servicios.
18.2. Cuando corresponda, el usuario podrá gestionar determinadas preferencias mediante las configuraciones disponibles en el navegador o en la plataforma.

19. CAMBIOS A LA POLÍTICA
19.1. BINGO+ podrá actualizar la presente Política cuando existan cambios en sus procesos, tecnologías, servicios o en la normativa aplicable.
19.2. La versión vigente estará disponible mediante los canales definidos por BINGO+.
19.3. Cuando un cambio requiera una comunicación específica o una nueva manifestación de voluntad del titular, BINGO+ aplicará el mecanismo correspondiente.

20. CONTACTO
Para consultas relacionadas con privacidad y protección de datos personales:
Responsable: {{razon_social_bingoplus}}
RUC: {{ruc_bingoplus}}
Correo de privacidad: {{correo_privacidad_bingoplus}}
Domicilio: {{direccion_bingoplus}}

21. VIGENCIA
La presente Política entra en vigencia a partir de la fecha indicada en su encabezado y permanecerá vigente mientras BINGO+ realice actividades de tratamiento de datos personales comprendidas dentro de su alcance.

22. CONSTANCIA DE INFORMACIÓN Y ACEPTACIÓN
La aceptación se registrará al seleccionar la casilla "He leído y acepto la Política de Privacidad y Tratamiento de Datos Personales de BINGO+ para Riders.". BINGO+ conservará evidencia de la aceptación, incluyendo usuario, fecha, hora, dirección IP, versión aceptada e identificación del Rider.`;

interface PublicLegalInfo {
  legalName: string;
  taxId: string;
  addressLine: string;
  privacyEmail: string | null;
}

function resolveText(legal: PublicLegalInfo): string {
  return RIDER_PRIVACY_TEXT.replaceAll('{{razon_social_bingoplus}}', legal.legalName)
    .replaceAll('{{ruc_bingoplus}}', legal.taxId)
    .replaceAll('{{direccion_bingoplus}}', legal.addressLine)
    .replaceAll('{{correo_privacidad_bingoplus}}', legal.privacyEmail || '(no configurado)');
}

export default function RiderPrivacyModal({ onClose }: { onClose: () => void }) {
  const [legal, setLegal] = useState<PublicLegalInfo | null | undefined>(undefined);

  useEffect(() => {
    apiFetch<PublicLegalInfo>('/public/legal-info').then(setLegal).catch(() => setLegal(null));
  }, []);

  return (
    <div className="dashboard-modal-overlay" onClick={onClose}>
      <div className="dashboard-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="dashboard-modal-header">
          <span className="dashboard-modal-title">Política de Privacidad y Tratamiento de Datos Personales para Riders</span>
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
