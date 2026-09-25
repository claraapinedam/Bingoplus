'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import TermsDocument from './TermsDocument';

// The real "Términos y Condiciones de Uso de la Plataforma BINGO+ para Riders" document the owner
// supplied (apps/rider/public/Terminos_y_Condiciones_Riders_BINGO+.docx), replacing the old
// hardcoded RIDER_TERMS_SECTIONS placeholder prose that used to live in TermsModal.tsx. Mirrors
// apps/business/src/components/BusinessTermsModal.tsx's structure exactly. The source document's
// version/date header line and the "☐" checkbox glyph inside clause 23.4 are intentionally left
// out — same reasoning as the business documents: this app has no version-tracking mechanism for
// this document (out of scope), and the checkbox in the form below is the real UI control, so
// restating it as text here would be redundant.
//
// "{{razon_social_bingoplus}}"/"{{ruc_bingoplus}}" mirror the exact placeholder names used
// throughout this project's other legal documents — resolved below from GET /public/legal-info
// (legalName/taxId only), never hardcoded.
const RIDER_TERMS_TEXT = `TÉRMINOS Y CONDICIONES DE USO DE LA PLATAFORMA BINGO+
RIDERS

PREÁMBULO
Los presentes Términos y Condiciones (en adelante, los "Términos") regulan el acceso, registro y uso de la plataforma tecnológica BINGO+, operada por {{razon_social_bingoplus}}, con RUC No. {{ruc_bingoplus}}, por parte de las personas que se registren y sean aprobadas como Riders para realizar servicios de entrega mediante la plataforma.
El acceso y uso de BINGO+ implica la aceptación de los presentes Términos, de la Política de Privacidad y Tratamiento de Datos Personales de BINGO+ para Riders y, cuando corresponda, del Contrato de Prestación de Servicios de Entrega y Uso de la Plataforma BINGO+ (en adelante, el "Contrato").

1. DEFINICIONES
Para efectos de los presentes Términos, los siguientes términos tendrán el significado que se indica a continuación:
1.1. BINGO+: {{razon_social_bingoplus}}, sociedad que opera la plataforma tecnológica que conecta a clientes, negocios afiliados y Riders para facilitar operaciones de compra, entrega y servicios relacionados con mascotas.
1.2. Rider: Persona natural previamente registrada y aprobada por BINGO+ para realizar servicios de entrega utilizando la plataforma.
1.3. Cliente: Usuario que realiza una compra o solicita una entrega a través de BINGO+.
1.4. Negocio: Establecimiento afiliado a BINGO+ que comercializa productos mediante la plataforma.
1.5. Pedido: Solicitud de entrega generada a través de BINGO+.
1.6. Plataforma: Conjunto de aplicaciones, sistemas, interfaces, herramientas, funcionalidades y servicios tecnológicos utilizados para operar BINGO+.
1.7. Aplicación Rider: Aplicación o interfaz mediante la cual el Rider puede recibir, aceptar, gestionar y completar pedidos.
1.8. Información de entrega: Información necesaria para ejecutar un pedido, incluyendo, según corresponda, el nombre del cliente, teléfono, dirección, ubicación, instrucciones de entrega y características del pedido.

2. REGISTRO Y APROBACIÓN DEL RIDER
2.1. Para utilizar la plataforma como Rider, el interesado deberá completar el proceso de registro establecido por BINGO+.
2.2. BINGO+ podrá solicitar la información y documentación necesaria para verificar la identidad, los datos de contacto, el vehículo, la licencia, la documentación habilitante u otros requisitos aplicables.
2.3. El registro no garantiza la aprobación como Rider.
2.4. La aprobación será realizada por BINGO+ conforme a sus procesos internos y a los requisitos vigentes.
2.5. BINGO+ podrá solicitar actualizaciones o verificaciones adicionales cuando resulte necesario para mantener activa la cuenta.

3. ACEPTACIÓN DEL CONTRATO
3.1. Una vez aprobado el registro, el Rider deberá aceptar y suscribir electrónicamente el Contrato antes de comenzar a realizar operaciones.
3.2. El Rider que no acepte el Contrato no podrá utilizar las funcionalidades destinadas a la prestación de servicios de entrega.
3.3. La aceptación electrónica del Contrato, de los presentes Términos y de las políticas aplicables constituirá evidencia de la voluntad del Rider de vincularse bajo las condiciones establecidas.

4. USO DE LA PLATAFORMA
4.1. El Rider utilizará BINGO+ exclusivamente para las actividades relacionadas con la prestación de servicios de entrega autorizadas por la plataforma.
4.2. El Rider deberá proporcionar y utilizar información verdadera, completa y actualizada.
4.3. Las credenciales de acceso son personales y no podrán ser cedidas, vendidas, alquiladas ni compartidas con terceros.
4.4. El Rider será responsable de mantener bajo su control sus credenciales de acceso.
4.5. Si el Rider identifica un acceso no autorizado o cualquier situación que comprometa su cuenta, deberá comunicarlo de inmediato a BINGO+.

5. RECEPCIÓN Y ACEPTACIÓN DE PEDIDOS
5.1. Los pedidos disponibles podrán ser mostrados al Rider a través de la Aplicación Rider.
5.2. El Rider podrá aceptar o rechazar los pedidos disponibles, conforme a las condiciones y funcionalidades mostradas en la plataforma.
5.3. Una vez aceptado un pedido, el Rider deberá realizar las acciones necesarias para completarlo conforme a las instrucciones correspondientes.
5.4. El Rider deberá informar oportunamente cualquier circunstancia que impida completar una entrega.

6. RECOLECCIÓN Y CUSTODIA DE PRODUCTOS
6.1. El Rider deberá verificar, dentro de lo razonablemente posible, que el pedido recibido corresponda a la información mostrada en la plataforma.
6.2. Desde la recepción del pedido y mientras este permanezca bajo su posesión, el Rider deberá adoptar medidas razonables para conservarlo en condiciones adecuadas.
6.3. El Rider no podrá abrir, consumir, utilizar, alterar, sustituir ni manipular indebidamente los productos.
6.4. Cuando la naturaleza del producto requiera condiciones especiales de transporte, el Rider deberá seguir las instrucciones comunicadas mediante la plataforma.

7. ENTREGA AL CLIENTE
7.1. El Rider deberá entregar el pedido en la dirección indicada en la plataforma.
7.2. Cuando corresponda, el Rider podrá solicitar la información razonablemente necesaria para verificar que la entrega se realice a la persona correcta.
7.3. El Rider deberá utilizar los mecanismos de confirmación de entrega establecidos por BINGO+, incluyendo, cuando corresponda, código de verificación, fotografía, confirmación electrónica u otros mecanismos.
7.4. El Rider no podrá entregar un pedido a una persona distinta del destinatario sin seguir el procedimiento establecido por BINGO+.

8. ENTREGA FALLIDA
8.1. Si la entrega no puede completarse por ausencia del cliente, dirección incorrecta, imposibilidad de contacto, rechazo del pedido u otra circunstancia, el Rider deberá informar la situación mediante la Aplicación Rider.
8.2. El Rider no podrá disponer unilateralmente del pedido.
8.3. BINGO+ determinará, conforme al procedimiento operativo aplicable, si corresponde una nueva entrega, la devolución al Negocio u otra solución.
8.4. El Rider deberá conservar el pedido mientras se determina el procedimiento correspondiente, salvo instrucción distinta de BINGO+.

9. PRODUCTOS DAÑADOS, PERDIDOS O INCOMPLETOS
9.1. Cuando un producto resulte perdido, sustraído, dañado, abierto, alterado, deteriorado o incompleto mientras se encuentre bajo posesión del Rider, BINGO+ podrá realizar una investigación.
9.2. Cuando existan elementos suficientes que permitan atribuir la responsabilidad al Rider por acción, omisión, negligencia, incumplimiento de instrucciones o conducta indebida, podrán aplicarse las medidas previstas en el Contrato.
9.3. El Rider tendrá derecho a conocer el hecho que se le atribuye y a presentar las explicaciones o evidencias que considere pertinentes.
9.4. No se atribuirá responsabilidad al Rider cuando existan elementos que demuestren que el daño, la pérdida o el deterioro no le son atribuibles.

10. PAGOS AL RIDER
10.1. BINGO+ pagará al Rider los valores, tarifas, comisiones o incentivos que correspondan por las entregas efectivamente realizadas, de acuerdo con las condiciones aplicables.
10.2. Las condiciones económicas constarán en el Contrato y su Anexo Operativo, y podrán ser informadas además mediante la aplicación o los mecanismos de comunicación establecidos por BINGO+.
10.3. BINGO+ podrá realizar ajustes relacionados con operaciones duplicadas, fraudulentas o anuladas, o con valores que legal o contractualmente deban ser corregidos.
10.4. Cuando corresponda, podrán aplicarse compensaciones relacionadas con pérdidas o daños atribuibles al Rider, conforme al Contrato y a la normativa aplicable.

11. OBLIGACIONES TRIBUTARIAS
11.1. El Rider será responsable de cumplir las obligaciones tributarias que legalmente le correspondan, derivadas de sus actividades.
11.2. Dichas obligaciones podrán incluir, según corresponda, las relacionadas con el Registro Único de Contribuyentes (RUC), la emisión de comprobantes de venta, las declaraciones, el Impuesto al Valor Agregado (IVA), el Impuesto a la Renta y las demás establecidas por la normativa ecuatoriana.
11.3. BINGO+ realizará las retenciones y cumplirá las demás obligaciones que legalmente le correspondan, cuando sean aplicables.

12. VEHÍCULO, DOCUMENTACIÓN Y SEGURIDAD VIAL
12.1. El Rider será responsable de contar con los documentos, permisos, licencias y autorizaciones exigibles para utilizar el vehículo con el que realice las entregas.
12.2. El vehículo utilizado deberá encontrarse en condiciones adecuadas para realizar las entregas.
12.3. El Rider deberá respetar las normas de tránsito y seguridad vial aplicables.
12.4. BINGO+ no garantiza la disponibilidad, el estado, el mantenimiento ni el funcionamiento del vehículo utilizado por el Rider.

13. ACCIDENTES E INCIDENTES
13.1. El Rider deberá comunicar a BINGO+ cualquier accidente, incidente, pérdida, robo, daño del pedido u otra situación relevante relacionada con una entrega.
13.2. Cuando corresponda, el Rider deberá proporcionar la información necesaria para documentar el incidente.
13.3. El Rider será responsable de sus propias actuaciones durante la prestación del servicio, conforme a la legislación aplicable y al Contrato.

14. CONDUCTAS PROHIBIDAS
Se prohíbe al Rider:
14.1. Utilizar la plataforma mediante información falsa;
14.2. Permitir que otra persona utilice su cuenta;
14.3. Manipular, alterar o falsificar información de pedidos o entregas;
14.4. Retener, abrir, consumir, vender o disponer indebidamente de productos;
14.5. Solicitar al cliente pagos adicionales no autorizados;
14.6. Utilizar información de clientes para fines distintos de la entrega;
14.7. Contactar posteriormente al cliente con fines comerciales o personales, utilizando información obtenida mediante BINGO+;
14.8. Intentar manipular los sistemas tecnológicos, mecanismos de asignación, pagos, promociones o incentivos; y,
14.9. Realizar cualquier conducta contraria a la legislación aplicable o a las políticas de BINGO+.

15. INFORMACIÓN DEL CLIENTE
15.1. El Rider podrá recibir información del cliente exclusivamente en la medida necesaria para realizar una entrega.
15.2. Esta información podrá incluir nombre, número telefónico, dirección, ubicación e instrucciones relacionadas con el pedido.
15.3. El Rider no podrá copiar, almacenar, vender, compartir, transferir ni utilizar dicha información para fines diferentes a la entrega.
15.4. Una vez cumplida la finalidad para la cual recibió la información, el Rider deberá abstenerse de continuar utilizándola.

16. GEOLOCALIZACIÓN
16.1. BINGO+ podrá utilizar la ubicación del Rider durante las operaciones de entrega.
16.2. La información de ubicación podrá utilizarse para:
Asignación y gestión de pedidos;
Cálculo y seguimiento de rutas;
Estimación de tiempos de llegada;
Mostrar información de seguimiento al cliente;
Verificar eventos relacionados con la entrega;
Atender incidentes y reclamos; y,
Mejorar la operación y la seguridad de la plataforma.
16.3. El tratamiento de los datos de ubicación se realizará conforme a la Política de Privacidad y Tratamiento de Datos Personales de BINGO+ para Riders y a la Ley Orgánica de Protección de Datos Personales.

17. PROPIEDAD INTELECTUAL
17.1. Los derechos sobre la plataforma, software, marcas, logotipos, diseños, interfaces, contenidos y demás elementos pertenecen a BINGO+ o a sus respectivos titulares.
17.2. El acceso a la plataforma no concede al Rider derechos de propiedad sobre dichos elementos.
17.3. El Rider no podrá copiar, modificar, distribuir, reproducir ni explotar comercialmente dichos elementos sin autorización previa y por escrito de BINGO+.

18. SUSPENSIÓN DE LA CUENTA
18.1. BINGO+ podrá suspender temporalmente el acceso del Rider cuando existan razones relacionadas con seguridad, fraude, incumplimiento contractual, protección de clientes, investigación de incidentes o cumplimiento legal.
18.2. Cuando corresponda y resulte razonablemente posible, BINGO+ informará al Rider la causa de la suspensión.
18.3. La suspensión podrá mantenerse durante el tiempo necesario para realizar las verificaciones correspondientes.

19. TERMINACIÓN
19.1. La relación podrá terminar conforme a las condiciones establecidas en el Contrato.
19.2. La terminación de la cuenta implicará la pérdida del acceso a las funcionalidades destinadas a Riders.
19.3. La terminación no extinguirá las obligaciones que por su naturaleza deban permanecer vigentes, incluyendo las de confidencialidad, protección de datos, obligaciones económicas pendientes y responsabilidad por hechos ocurridos durante la prestación del servicio.

20. ACTUALIZACIONES DE LOS TÉRMINOS
20.1. BINGO+ podrá actualizar los presentes Términos cuando resulte necesario debido a cambios operativos, tecnológicos, comerciales o regulatorios.
20.2. Las modificaciones serán comunicadas mediante los mecanismos disponibles en la plataforma o por otros medios adecuados.
20.3. Cuando una modificación requiera una nueva aceptación por parte del Rider, BINGO+ podrá solicitarla antes de permitir la continuidad de determinadas funcionalidades.

21. ATENCIÓN Y COMUNICACIONES
21.1. Las comunicaciones operativas podrán realizarse mediante la aplicación, correo electrónico, mensajes internos, teléfono u otros canales habilitados.
21.2. El Rider deberá mantener actualizados sus datos de contacto.

22. LEGISLACIÓN APLICABLE
22.1. Los presentes Términos se regirán por la legislación de la República del Ecuador.
22.2. Cualquier controversia será gestionada inicialmente mediante los mecanismos de atención y solución establecidos por BINGO+, sin perjuicio del derecho de las partes de acudir a las autoridades o mecanismos legalmente competentes.

23. ACEPTACIÓN
23.1. El Rider declara haber leído y comprendido los presentes Términos.
23.2. La aceptación electrónica realizada mediante la plataforma tendrá los efectos previstos en la Ley de Comercio Electrónico, Firmas Electrónicas y Mensajes de Datos, el Código de Comercio y demás legislación aplicable.
23.3. El uso continuado de las funcionalidades de Rider estará sujeto a los presentes Términos y al Contrato.
23.4. La aceptación se registrará al seleccionar la casilla "Acepto los Términos y Condiciones de Uso de la Plataforma BINGO+ para Riders". BINGO+ conservará evidencia de la aceptación, incluyendo usuario, fecha, hora, dirección IP, versión aceptada e identificación del Rider.`;

interface PublicLegalInfo {
  legalName: string;
  taxId: string;
}

function resolveText(legal: PublicLegalInfo): string {
  return RIDER_TERMS_TEXT.replaceAll('{{razon_social_bingoplus}}', legal.legalName).replaceAll(
    '{{ruc_bingoplus}}',
    legal.taxId,
  );
}

export default function RiderTermsModal({ onClose }: { onClose: () => void }) {
  const [legal, setLegal] = useState<PublicLegalInfo | null | undefined>(undefined);

  useEffect(() => {
    apiFetch<PublicLegalInfo>('/public/legal-info').then(setLegal).catch(() => setLegal(null));
  }, []);

  return (
    <div className="dashboard-modal-overlay" onClick={onClose}>
      <div className="dashboard-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="dashboard-modal-header">
          <span className="dashboard-modal-title">Términos y Condiciones de Uso de la Plataforma BINGO+ para Riders</span>
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
          {legal && <TermsDocument text={resolveText(legal)} />}
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
