'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import PrivacyDocument from './PrivacyDocument';

// The real "Política de Privacidad y Tratamiento de Datos Personales — Clientes BINGO+" document
// the owner supplied (apps/customer/public/Politica_Privacidad_Clientes_BINGO+.docx). Mirrors
// CustomerTermsModal.tsx's structure and apps/business/rider's equivalent Privacy modals. The
// source document's version/date header line is intentionally left out, same reasoning as the
// other legal documents in this project. §25.1/§25.2 below reference the owner's exact checkbox
// wording used in the registration form (see RegisterPage), not the docx's own slightly different
// original phrasing.
//
// "{{razon_social_bingoplus}}"/"{{ruc_bingoplus}}"/"{{direccion_bingoplus}}"/
// "{{correo_privacidad_bingoplus}}" resolve from GET /public/legal-info
// (legalName/taxId/addressLine/privacyEmail). The source .docx had a separate
// "[CANAL DE SOLICITUDES DE DATOS]" placeholder alongside "[CORREO DE PRIVACIDAD BINGO+]" — there
// is no distinct backend field for that beyond privacyEmail, so every occurrence of
// "{{correo_privacidad_bingoplus}}" below (§1.1 twice, §17.1 twice, §23 twice) intentionally
// resolves to the same privacyEmail value, falling back to "(no configurado)" when null — same
// defensive handling as the business/rider Privacy modals.
const CUSTOMER_PRIVACY_TEXT = `POLÍTICA DE PRIVACIDAD Y TRATAMIENTO DE DATOS PERSONALES
CLIENTES BINGO+

PREÁMBULO
BINGO+ reconoce el derecho de las personas a la protección de sus datos personales y establece, mediante la presente Política de Privacidad y Tratamiento de Datos Personales (en adelante, la "Política"), las condiciones bajo las cuales recopila, utiliza, almacena, comunica y protege la información de sus Clientes, de conformidad con la Ley Orgánica de Protección de Datos Personales (en adelante, "LOPDP"), su Reglamento y la normativa expedida por la Superintendencia de Protección de Datos Personales.
La presente Política se pone a disposición del Cliente antes o al momento de la recopilación de sus datos personales, se mantendrá disponible de forma permanente y reflejará las actividades de tratamiento que BINGO+ efectivamente realiza.

1. RESPONSABLE DEL TRATAMIENTO
1.1. El responsable del tratamiento de los datos personales es:
Razón social: {{razon_social_bingoplus}}
RUC: {{ruc_bingoplus}}
Domicilio: {{direccion_bingoplus}}
Correo electrónico: {{correo_privacidad_bingoplus}}
Canal de protección de datos: {{correo_privacidad_bingoplus}}
1.2. Para efectos de la presente Política, el responsable del tratamiento se denominará "BINGO+".

2. ALCANCE
2.1. La presente Política aplica a las personas que crean una cuenta, utilizan BINGO+, realizan compras, consultan servicios, realizan reservas o interactúan con la plataforma como Clientes.
2.2. También aplica a los datos generados durante el uso de la plataforma, en la medida en que constituyan datos personales.

3. DATOS PERSONALES QUE PODEMOS RECOPILAR
Dependiendo de las funcionalidades utilizadas, BINGO+ podrá tratar las siguientes categorías de datos:
3.1. Datos de identificación: Nombre y otros datos necesarios para identificar al usuario.
3.2. Datos de contacto: Teléfono, correo electrónico y otros medios de contacto.
3.3. Datos de entrega: Dirección, referencias e instrucciones necesarias para entregar un pedido.
3.4. Datos de ubicación: Ubicación del Cliente, cuando sea necesaria para determinadas funcionalidades.
3.5. Datos de mascotas: Información que el Cliente decida registrar sobre sus mascotas para utilizar funcionalidades de BINGO+.
3.6. Datos de compra: Productos adquiridos, pedidos, reservas, servicios utilizados y operaciones realizadas.
3.7. Datos de pago: Información necesaria para procesar una transacción. Cuando el procesamiento de pagos sea realizado por un proveedor especializado, determinados datos financieros podrán ser tratados directamente por dicho proveedor.
3.8. Datos de comunicaciones: Información proporcionada mediante soporte, reclamos, solicitudes y comunicaciones con BINGO+.
3.9. Datos técnicos: Dispositivo, sistema operativo, identificadores técnicos, registros de actividad, dirección IP u otra información necesaria para la seguridad y el funcionamiento de la plataforma.

4. INFORMACIÓN DE LAS MASCOTAS
4.1. BINGO+ podrá permitir al Cliente crear perfiles para sus mascotas.
4.2. El Cliente podrá proporcionar información como:
Nombre;
Especie;
Raza;
Edad o fecha de nacimiento;
Peso;
Fotografías;
Preferencias; e,
Información necesaria para determinadas funcionalidades.
4.3. La información sobre la salud, los medicamentos o las alergias de las mascotas será tratada con confidencialidad y únicamente para las funcionalidades a las que el Cliente la destine. Si el Cliente proporciona información que revele datos sensibles de personas, BINGO+ aplicará las condiciones y bases legales que la LOPDP exige para dichas categorías.
4.4. El Cliente deberá abstenerse de proporcionar información que no sea necesaria para la funcionalidad correspondiente.

5. FINALIDADES DEL TRATAMIENTO
BINGO+ podrá tratar los datos personales para las siguientes finalidades:
5.1. Crear y administrar la cuenta del Cliente.
5.2. Autenticar al usuario.
5.3. Procesar pedidos.
5.4. Procesar pagos.
5.5. Coordinar entregas.
5.6. Facilitar la comunicación entre el Cliente, el Negocio y el Rider cuando sea necesaria para una operación.
5.7. Facilitar reservas y servicios del Directorio.
5.8. Mostrar información relacionada con pedidos y entregas.
5.9. Atender consultas, reclamos y solicitudes.
5.10. Prevenir el fraude y las actividades ilícitas.
5.11. Proteger la seguridad de los usuarios y de los sistemas.
5.12. Cumplir obligaciones legales.
5.13. Generar estadísticas e indicadores.
5.14. Mejorar productos, servicios y funcionalidades.
5.15. Enviar comunicaciones comerciales, cuando exista una base legal que lo permita y, cuando corresponda, el consentimiento del Cliente.

6. BASES DE LEGITIMACIÓN
6.1. BINGO+ tratará datos personales únicamente cuando exista una base de legitimación válida conforme a la LOPDP, entre ellas el consentimiento del titular, el cumplimiento de obligaciones legales, la ejecución de medidas precontractuales o contractuales solicitadas por el Cliente y el interés legítimo, cuando sea jurídicamente aplicable.
6.2. Cuando el tratamiento se base en el consentimiento, este deberá ser libre, específico, informado e inequívoco.
6.3. El Cliente podrá retirar su consentimiento en cualquier momento mediante los mecanismos disponibles, sin que ello afecte la licitud del tratamiento realizado con anterioridad.

7. CREACIÓN Y GESTIÓN DE LA CUENTA
7.1. Para crear y administrar una cuenta, BINGO+ podrá tratar:
Nombre;
Teléfono;
Correo electrónico;
Credenciales;
Información de seguridad; e,
Información necesaria para gestionar la cuenta.
7.2. Estos tratamientos se fundamentan en la prestación de las funcionalidades solicitadas por el usuario y en las demás bases de legitimación aplicables.

8. UBICACIÓN Y GEOLOCALIZACIÓN
8.1. BINGO+ podrá tratar información de ubicación cuando sea necesaria para determinadas funcionalidades.
8.2. Dicho tratamiento podrá tener por objeto:
Establecer una dirección de entrega;
Identificar negocios cercanos;
Mostrar proveedores cercanos;
Calcular distancias;
Facilitar la entrega;
Permitir el seguimiento del pedido; y,
Mejorar la seguridad y la operación.
8.3. BINGO+ limitará el uso de la ubicación a las finalidades para las cuales sea necesaria.
8.4. El usuario podrá administrar los permisos de ubicación mediante las configuraciones disponibles en su dispositivo y en la aplicación.

9. INFORMACIÓN COMPARTIDA CON EL NEGOCIO
9.1. Cuando el Cliente realiza un pedido, BINGO+ podrá comunicar al Negocio la información necesaria para procesarlo, que podrá incluir:
Nombre;
Productos solicitados;
Información necesaria para preparar el pedido;
Información de contacto, cuando sea necesaria; e,
Información relacionada con la entrega, cuando corresponda.
9.2. El Negocio deberá tratar esta información conforme a las obligaciones legales aplicables.

10. INFORMACIÓN COMPARTIDA CON EL RIDER
10.1. Para realizar una entrega, BINGO+ podrá proporcionar al Rider la información estrictamente necesaria para completar el pedido, que podrá incluir:
Nombre del Cliente;
Dirección;
Ubicación;
Teléfono o mecanismo de contacto;
Instrucciones de entrega; e,
Información necesaria para identificar el pedido.
10.2. El Rider deberá utilizar esta información exclusivamente para realizar la entrega y estará sujeto a las obligaciones de protección de datos aplicables.

11. PROVEEDORES TECNOLÓGICOS
11.1. BINGO+ podrá utilizar proveedores tecnológicos para operar sus servicios, incluyendo proveedores de:
Infraestructura y alojamiento;
Mapas y geolocalización;
Procesamiento de pagos;
Comunicaciones;
Autenticación;
Analítica;
Soporte;
Seguridad;
Almacenamiento; y,
Otros servicios necesarios para la operación.
11.2. Cuando un tercero trate datos personales por cuenta de BINGO+ en calidad de encargado del tratamiento, BINGO+ suscribirá con dicho tercero el contrato exigido por la LOPDP.

12. MARKETING Y COMUNICACIONES COMERCIALES
12.1. BINGO+ podrá enviar información relacionada con promociones, novedades, descuentos, productos o servicios cuando exista una base legal que lo permita.
12.2. Cuando sea necesario el consentimiento, este será solicitado de manera específica y separada de la aceptación de la presente Política.
12.3. El Cliente podrá retirar su consentimiento para recibir comunicaciones comerciales en cualquier momento, mediante los mecanismos disponibles.
12.4. La negativa a recibir comunicaciones comerciales no impedirá el acceso a las funcionalidades esenciales de la cuenta.

13. COOKIES Y TECNOLOGÍAS SIMILARES
13.1. BINGO+ podrá utilizar cookies, identificadores técnicos y tecnologías similares en sus interfaces web y aplicaciones.
13.2. Estas tecnologías podrán utilizarse con fines de:
Funcionamiento;
Seguridad;
Autenticación;
Registro de preferencias;
Análisis de uso; y,
Mejora de los servicios.
13.3. Cuando corresponda, el usuario podrá gestionar determinadas preferencias desde su dispositivo o navegador.

14. CONSERVACIÓN DE DATOS
14.1. BINGO+ conservará los datos durante el período necesario para cumplir las finalidades correspondientes.
14.2. Determinados datos podrán conservarse durante períodos adicionales cuando sea necesario para:
Cumplir obligaciones legales;
Cumplir obligaciones tributarias o contables;
Prevenir el fraude;
Resolver reclamos;
Ejercer o defender derechos;
Cumplir obligaciones contractuales; o,
Atender requerimientos de autoridades.
14.3. Cuando los datos ya no sean necesarios y no exista una obligación legítima de conservarlos, serán eliminados, anonimizados o tratados conforme a la normativa aplicable.

15. SEGURIDAD
15.1. BINGO+ implementará medidas técnicas, organizativas y administrativas destinadas a proteger los datos personales.
15.2. Dichas medidas estarán orientadas a reducir los riesgos de:
Acceso no autorizado;
Pérdida;
Destrucción;
Alteración;
Divulgación indebida; y,
Utilización no autorizada.
15.3. Ningún sistema tecnológico puede garantizar una seguridad absoluta; por ello, BINGO+ mantendrá mecanismos de prevención, detección y respuesta adecuados a los riesgos identificados.

16. DERECHOS DEL TITULAR
El Cliente podrá ejercer los derechos reconocidos por la LOPDP, incluyendo, según corresponda, los derechos de:
16.1. Acceso.
16.2. Rectificación y actualización.
16.3. Eliminación.
16.4. Oposición.
16.5. Suspensión del tratamiento.
16.6. Portabilidad, cuando corresponda.
16.7. Retiro del consentimiento.
16.8. No ser objeto de decisiones basadas únicamente en valoraciones automatizadas, conforme a la sección 18.
16.9. Los demás derechos reconocidos por la normativa aplicable.
Sin perjuicio de lo anterior, el Cliente podrá presentar reclamos ante la Superintendencia de Protección de Datos Personales, conforme a la ley.

17. EJERCICIO DE DERECHOS
17.1. El Cliente podrá presentar sus solicitudes mediante:
Correo electrónico: {{correo_privacidad_bingoplus}}
Canal: {{correo_privacidad_bingoplus}}
Dirección: {{direccion_bingoplus}}
17.2. BINGO+ podrá solicitar la información razonablemente necesaria para verificar la identidad del solicitante y evitar accesos indebidos a información personal.
17.3. Las solicitudes serán atendidas dentro de los plazos y conforme a los procedimientos establecidos por la LOPDP.

18. DECISIONES AUTOMATIZADAS
18.1. BINGO+ podrá utilizar herramientas automatizadas en determinados procesos operativos, tales como la prevención del fraude, la seguridad, la asignación operativa, las recomendaciones o la personalización.
18.2. Cuando una decisión automatizada produzca efectos jurídicos o afecte significativamente al titular, en los términos de la LOPDP, el Cliente podrá ejercer los derechos que correspondan, incluyendo solicitar la intervención humana y la revisión de la decisión.

19. INCIDENTES DE SEGURIDAD
19.1. BINGO+ contará con procedimientos para identificar, evaluar y gestionar incidentes de seguridad relacionados con datos personales.
19.2. Cuando corresponda legalmente, BINGO+ realizará las notificaciones exigidas por la LOPDP ante la Superintendencia de Protección de Datos Personales y/o los titulares afectados.

20. TRANSFERENCIAS INTERNACIONALES
20.1. BINGO+ podrá utilizar proveedores tecnológicos ubicados fuera del Ecuador.
20.2. Cuando ello implique una transferencia o comunicación internacional de datos personales, BINGO+ aplicará los requisitos y garantías exigidos por la LOPDP.

21. NIÑAS, NIÑOS Y ADOLESCENTES
21.1. La creación de cuentas está destinada a personas con capacidad legal para utilizar la plataforma conforme a la legislación aplicable.
21.2. Cuando BINGO+ trate datos de niñas, niños o adolescentes, aplicará las reglas especiales previstas por la LOPDP y atenderá a su interés superior.
21.3. Cuando corresponda, se requerirá la autorización de su representante legal.

22. CAMBIOS EN LA POLÍTICA
22.1. BINGO+ podrá modificar la presente Política cuando existan cambios en los servicios, funcionalidades, tecnologías, procesos o normativa aplicable.
22.2. La versión vigente permanecerá disponible en los canales oficiales de BINGO+.
22.3. Cuando un cambio requiera un consentimiento adicional, BINGO+ lo solicitará de forma previa.

23. CONTACTO
Para consultas relacionadas con privacidad y protección de datos personales:
Responsable: {{razon_social_bingoplus}}
Correo de privacidad: {{correo_privacidad_bingoplus}}
Canal: {{correo_privacidad_bingoplus}}

24. VIGENCIA
La presente Política entra en vigencia a partir de la fecha indicada en su encabezado y permanecerá disponible mientras BINGO+ realice actividades de tratamiento de datos personales comprendidas dentro de su alcance.

25. CONSTANCIA DE INFORMACIÓN Y CONSENTIMIENTOS
25.1. La constancia de haber sido informado sobre la presente Política se registrará al seleccionar la casilla "He sido informado sobre la Política de Privacidad y Tratamiento de Datos Personales.".
25.2. De forma separada y opcional, el Cliente podrá otorgar su consentimiento para recibir comunicaciones comerciales mediante la casilla "Autorizo el tratamiento de mis datos para recibir promociones, descuentos y comunicaciones comerciales de BINGO+.".
25.3. BINGO+ conservará evidencia de la constancia y de los consentimientos otorgados, incluyendo usuario, fecha, hora, dirección IP y versión de la Política.`;

interface PublicLegalInfo {
  legalName: string;
  taxId: string;
  addressLine: string;
  privacyEmail: string | null;
}

function resolveText(legal: PublicLegalInfo): string {
  return CUSTOMER_PRIVACY_TEXT.replaceAll('{{razon_social_bingoplus}}', legal.legalName)
    .replaceAll('{{ruc_bingoplus}}', legal.taxId)
    .replaceAll('{{direccion_bingoplus}}', legal.addressLine)
    .replaceAll('{{correo_privacidad_bingoplus}}', legal.privacyEmail || '(no configurado)');
}

export default function CustomerPrivacyModal({ onClose }: { onClose: () => void }) {
  const [legal, setLegal] = useState<PublicLegalInfo | null | undefined>(undefined);

  useEffect(() => {
    apiFetch<PublicLegalInfo>('/public/legal-info').then(setLegal).catch(() => setLegal(null));
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(23,43,77,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-sm)',
          width: '100%',
          maxWidth: 640,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '16px 16px 12px',
            borderBottom: '1px solid #eef1f5',
          }}
        >
          <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--bingo-navy)' }}>
            Política de Privacidad y Tratamiento de Datos Personales
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{ background: 'none', border: 'none', fontSize: 18, lineHeight: 1, cursor: 'pointer', color: '#7f8ea3', flexShrink: 0 }}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: 16, overflowY: 'auto' }}>
          {legal === undefined && <p style={{ margin: 0, color: '#7f8ea3' }}>Cargando…</p>}
          {legal === null && (
            <p style={{ margin: 0, color: '#c0392b' }}>
              No pudimos cargar el documento en este momento. Intenta de nuevo más tarde.
            </p>
          )}
          {legal && <PrivacyDocument text={resolveText(legal)} />}
        </div>
        <div style={{ padding: '12px 16px 16px', borderTop: '1px solid #eef1f5' }}>
          <button type="button" className="bingo-button secondary small" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
