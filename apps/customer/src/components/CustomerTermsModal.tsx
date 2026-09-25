'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import TermsDocument from './TermsDocument';

// The real "Términos y Condiciones de Uso de la Plataforma BINGO+ — Clientes" document the owner
// supplied (apps/customer/public/Terminos_y_Condiciones_Clientes_BINGO+.docx). Mirrors
// apps/business/src/components/BusinessTermsModal.tsx's and apps/rider/src/components/
// RiderTermsModal.tsx's structure exactly. The source document's version/date header line is
// intentionally left out — same reasoning as the other apps' legal documents: this app has no
// version-tracking mechanism for this document (out of scope), and the checkbox in the
// registration form below is the real UI control. Two spots that referenced a
// "[CANAL DE ATENCIÓN AL CLIENTE]" placeholder with no backend field (Preámbulo and §11.2) were
// reworded to reference "los canales de atención habilitados por BINGO+" instead, so no
// unresolved token is left in the rendered text.
//
// "{{razon_social_bingoplus}}"/"{{ruc_bingoplus}}"/"{{direccion_bingoplus}}" mirror the exact
// placeholder names used throughout this project's other legal documents — resolved below from
// GET /public/legal-info (legalName/taxId/addressLine only), never hardcoded.
const CUSTOMER_TERMS_TEXT = `TÉRMINOS Y CONDICIONES DE USO DE LA PLATAFORMA BINGO+
CLIENTES

PREÁMBULO
Los presentes Términos y Condiciones de Uso (en adelante, los "Términos") regulan el acceso y la utilización de la plataforma tecnológica BINGO+ por parte de los usuarios que se registren como clientes.
La plataforma es operada por:
Razón social: {{razon_social_bingoplus}}
RUC: {{ruc_bingoplus}}
Domicilio: {{direccion_bingoplus}}
Al crear una cuenta y utilizar BINGO+, el usuario declara que ha leído y acepta los presentes Términos.
La utilización de determinados servicios podrá estar sujeta, además, a condiciones específicas que serán informadas al usuario antes de realizar la operación correspondiente.

1. DEFINICIONES
Para efectos de los presentes Términos, los siguientes términos tendrán el significado que se indica a continuación:
1.1. BINGO+: {{razon_social_bingoplus}}, sociedad que opera la plataforma tecnológica orientada a facilitar la conexión entre clientes, negocios afiliados y proveedores de servicios relacionados con mascotas.
1.2. Usuario o Cliente: Persona que crea una cuenta y utiliza BINGO+ para acceder a sus funcionalidades.
1.3. Negocio: Establecimiento afiliado que comercializa productos a través del Marketplace de BINGO+.
1.4. Proveedor de Servicios: Persona o negocio que ofrece servicios relacionados con mascotas mediante el Directorio de BINGO+.
1.5. Rider: Persona que realiza servicios de entrega mediante BINGO+.
1.6. Marketplace: Sección de BINGO+ destinada a la comercialización de productos ofrecidos por negocios afiliados.
1.7. Directorio: Sección de BINGO+ destinada a facilitar la búsqueda de proveedores de servicios relacionados con mascotas.
1.8. Pedido: Solicitud realizada por el Cliente para adquirir productos disponibles en el Marketplace.
1.9. Servicio: Actividad ofrecida por un Proveedor de Servicios a través del Directorio.
1.10. Plataforma: Aplicaciones, sitio web, sistemas, interfaces, funcionalidades y demás componentes tecnológicos que conforman BINGO+.

2. REGISTRO DE USUARIO
2.1. Para utilizar determinadas funcionalidades de BINGO+, el usuario deberá crear una cuenta.
2.2. El usuario deberá proporcionar información verdadera, completa y actualizada.
2.3. BINGO+ podrá solicitar información adicional cuando sea necesaria para verificar la cuenta, procesar una operación, prevenir fraude, cumplir obligaciones legales o proteger la seguridad de la plataforma.
2.4. El usuario será responsable de mantener actualizada la información proporcionada.

3. CUENTA DEL USUARIO
3.1. La cuenta es personal y no deberá ser compartida con terceros.
3.2. El usuario será responsable de mantener la confidencialidad de sus credenciales.
3.3. El usuario deberá informar a BINGO+ cualquier acceso no autorizado o situación que pueda comprometer la seguridad de su cuenta.
3.4. BINGO+ podrá adoptar medidas de seguridad, incluyendo la suspensión temporal de una cuenta, cuando existan indicios razonables de fraude, acceso no autorizado o uso indebido.

4. ACEPTACIÓN DE LOS TÉRMINOS
4.1. Al seleccionar la opción de aceptación durante el registro, el usuario manifiesta su voluntad de aceptar los presentes Términos.
4.2. La aceptación electrónica quedará asociada a la cuenta del usuario y podrá registrarse junto con la versión de los Términos aceptada, la fecha y la hora correspondientes.
4.3. El usuario podrá consultar la versión vigente de los presentes Términos mediante los canales habilitados por BINGO+.
4.4. Cuando una modificación requiera una nueva aceptación, BINGO+ podrá solicitarla antes de permitir la continuidad del uso de determinadas funcionalidades.

5. USO DEL MARKETPLACE
5.1. BINGO+ facilita, mediante el Marketplace, la conexión entre Clientes y Negocios que ofrecen productos para mascotas.
5.2. Los productos mostrados en el Marketplace son ofrecidos por los respectivos Negocios.
5.3. La información del producto, incluyendo precio, características, disponibilidad, condiciones de venta y demás información comercial, será proporcionada por el Negocio correspondiente, sin perjuicio de las obligaciones que legalmente correspondan a BINGO+ como operador de la plataforma.
5.4. El Cliente deberá revisar la información del producto antes de confirmar una compra.

6. REALIZACIÓN DE PEDIDOS
6.1. El Cliente podrá seleccionar productos disponibles, agregarlos al carrito y realizar el proceso de compra.
6.2. Antes de confirmar el pedido, BINGO+ mostrará, según corresponda, los productos seleccionados, las cantidades, los precios, los costos de entrega, los impuestos y otros valores aplicables.
6.3. Una vez confirmado el pedido, este podrá pasar al proceso de preparación y entrega correspondiente.
6.4. La disponibilidad efectiva del producto estará sujeta a la información proporcionada por el Negocio.

7. PAGOS
7.1. Los pagos podrán procesarse mediante los medios de pago habilitados en BINGO+.
7.2. El usuario deberá proporcionar información correcta cuando sea necesaria para procesar el pago.
7.3. BINGO+ podrá utilizar proveedores especializados de procesamiento de pagos.
7.4. Los datos completos de tarjetas u otros instrumentos de pago podrán ser tratados directamente por el proveedor de pagos, cuando corresponda.
7.5. BINGO+ podrá realizar verificaciones de seguridad, prevención de fraude y validación de transacciones.

8. PRECIOS E IMPUESTOS
8.1. Los precios mostrados al Cliente corresponderán a la información disponible al momento de realizar la operación.
8.2. Cuando corresponda, se mostrarán por separado los impuestos, los costos de entrega y otros valores aplicables.
8.3. Las obligaciones tributarias relacionadas con la venta de productos corresponderán al respectivo proveedor, conforme a la ley.
8.4. BINGO+ podrá gestionar determinados valores en nombre o por cuenta del participante correspondiente, cuando resulte aplicable y conforme a la normativa vigente.

9. ENTREGA DE PEDIDOS
9.1. Cuando el Cliente seleccione la opción de entrega, el pedido podrá ser asignado a un Rider disponible.
9.2. El Cliente deberá proporcionar una dirección e instrucciones de entrega correctas.
9.3. El Cliente podrá recibir información sobre el estado del pedido y, cuando la funcionalidad esté disponible, sobre la ubicación o el avance de la entrega.
9.4. Los tiempos de entrega mostrados por la plataforma son estimaciones y podrán variar por la disponibilidad del Negocio, el tráfico, el clima, las condiciones de ruta, la demanda u otras circunstancias operativas.

10. RESPONSABILIDAD SOBRE LOS PRODUCTOS
10.1. El Negocio será responsable de los productos que comercializa, incluyendo su calidad, características, empaque, legalidad y disponibilidad, así como del cumplimiento de las obligaciones que legalmente le correspondan.
10.2. El Rider será responsable de la custodia del pedido mientras este se encuentre bajo su posesión, conforme a las condiciones aplicables a su relación con BINGO+.
10.3. BINGO+ facilitará tecnológicamente la operación y gestionará las incidencias que correspondan conforme a sus procedimientos y obligaciones legales.

11. CANCELACIONES, DEVOLUCIONES Y RECLAMOS
11.1. Las condiciones de cancelación, devolución, reembolso o sustitución podrán variar según la naturaleza de la operación y serán informadas al Cliente antes de confirmar la operación, cuando corresponda.
11.2. El Cliente podrá presentar reclamos relacionados con pedidos mediante los canales de atención habilitados por BINGO+.
11.3. BINGO+ podrá solicitar información, fotografías, comprobantes u otros elementos necesarios para investigar un reclamo.
11.4. Cuando un reclamo corresponda directamente al Negocio, BINGO+ podrá gestionarlo o canalizarlo conforme a sus procedimientos.
11.5. Lo dispuesto en esta sección no limita los derechos de devolución, reparación, reposición o reembolso que la Ley Orgánica de Defensa del Consumidor reconoce al Cliente.

12. USO DEL DIRECTORIO
12.1. El Directorio permite a los Clientes encontrar proveedores de servicios relacionados con mascotas.
12.2. Los servicios publicados podrán incluir, entre otros:
Servicios veterinarios;
Peluquería y estética canina y felina (grooming);
Hospedaje;
Guarderías;
Paseadores o cuidadores;
Entrenamiento;
Transporte;
Fotografía;
Servicios especializados; y,
Otros servicios relacionados con mascotas.
12.3. El Directorio no implica que BINGO+ preste directamente dichos servicios.
12.4. El Proveedor de Servicios será responsable de la prestación del servicio contratado con el Cliente, sin perjuicio de las obligaciones que correspondan a BINGO+ como operador de la plataforma.

13. RESERVAS Y SERVICIOS
13.1. Cuando una funcionalidad permita reservar un servicio, el Cliente deberá revisar las condiciones informadas por el Proveedor de Servicios antes de confirmar la reserva.
13.2. El Proveedor de Servicios será responsable de cumplir las condiciones del servicio que haya ofrecido.
13.3. BINGO+ podrá facilitar comunicaciones, reservas, pagos, promociones o mecanismos de gestión relacionados con dichos servicios, cuando dichas funcionalidades se encuentren disponibles.

14. PROMOCIONES Y CUPONES
14.1. BINGO+ podrá ofrecer promociones, descuentos, cupones u otros beneficios.
14.2. Las promociones podrán estar sujetas a condiciones específicas, vigencia, disponibilidad, restricciones geográficas o límites de uso.
14.3. Cada promoción se regirá por las condiciones particulares que sean comunicadas al Cliente.

15. COMUNICACIONES
15.1. BINGO+ podrá comunicarse con el Cliente para asuntos relacionados con su cuenta, pedidos, pagos, entregas, reservas, seguridad, soporte o funcionamiento de la plataforma.
15.2. Las comunicaciones podrán realizarse mediante notificaciones de la aplicación, correo electrónico, mensajes, llamadas u otros canales habilitados.
15.3. Las comunicaciones comerciales estarán sujetas a las preferencias y autorizaciones otorgadas por el Cliente.

16. OBLIGACIONES DEL USUARIO
El Cliente se obliga a:
16.1. Utilizar información verdadera.
16.2. Utilizar su cuenta de manera personal y legítima.
16.3. Realizar pagos válidos.
16.4. Proporcionar información correcta para la entrega.
16.5. No utilizar BINGO+ para actividades fraudulentas o ilícitas.
16.6. No intentar alterar, interferir o vulnerar los sistemas tecnológicos.
16.7. No utilizar la información de otros usuarios para fines no autorizados.
16.8. Tratar con respeto a los Riders, Negocios, Proveedores de Servicios y demás usuarios.

17. CONDUCTAS PROHIBIDAS
Se prohíbe utilizar BINGO+ para:
17.1. Cometer fraude o realizar actividades ilícitas.
17.2. Suplantar la identidad de terceros.
17.3. Manipular promociones, pedidos o sistemas de pago.
17.4. Crear múltiples cuentas con el propósito de obtener beneficios indebidos.
17.5. Intentar acceder a cuentas de terceros.
17.6. Introducir software malicioso o realizar ataques contra la plataforma.
17.7. Utilizar información obtenida de BINGO+ para acosar, contactar indebidamente o perjudicar a terceros.

18. PROPIEDAD INTELECTUAL
18.1. BINGO+ y sus licenciantes conservarán los derechos sobre el software, marcas, diseños, interfaces, contenidos y demás elementos de la plataforma.
18.2. El uso de la aplicación no transfiere al Cliente derechos de propiedad sobre dichos elementos.
18.3. El Cliente no podrá copiar, modificar, distribuir ni explotar comercialmente los elementos protegidos de BINGO+ sin autorización previa y por escrito.

19. DISPONIBILIDAD DE LA PLATAFORMA
19.1. BINGO+ procurará mantener la plataforma disponible y funcionando adecuadamente.
19.2. Podrán producirse interrupciones por mantenimiento, actualizaciones, fallas técnicas, problemas de conectividad, proveedores externos, caso fortuito, fuerza mayor u otras circunstancias.
19.3. BINGO+ adoptará medidas razonables para restablecer los servicios cuando se produzcan interrupciones.

20. SUSPENSIÓN O CIERRE DE CUENTA
20.1. BINGO+ podrá suspender o cerrar una cuenta cuando exista incumplimiento de los presentes Términos, fraude, uso indebido, riesgos de seguridad o una obligación legal que así lo requiera.
20.2. Cuando corresponda, BINGO+ comunicará al usuario la medida adoptada y sus motivos.
20.3. El cierre de la cuenta no afectará las obligaciones que deban permanecer vigentes por su naturaleza, ni los pedidos, pagos o reclamos pendientes.

21. PROTECCIÓN DE DATOS PERSONALES
21.1. El tratamiento de los datos personales del Cliente se realizará conforme a la Política de Privacidad y Tratamiento de Datos Personales de BINGO+ para Clientes y a la Ley Orgánica de Protección de Datos Personales.
21.2. Dicha Política forma parte del marco de información aplicable al uso de la plataforma.
21.3. Cuando un tratamiento requiera consentimiento, BINGO+ lo solicitará de forma previa, conforme a la legislación aplicable.

22. MODIFICACIONES
22.1. BINGO+ podrá modificar los presentes Términos cuando sea necesario debido a cambios en los servicios, funcionalidades, procesos, tecnología o normativa aplicable.
22.2. Las modificaciones serán comunicadas mediante los canales disponibles.
22.3. Cuando sea legalmente necesario, se solicitará una nueva aceptación antes de continuar utilizando determinadas funcionalidades.

23. LEGISLACIÓN APLICABLE
23.1. Los presentes Términos se regirán por la legislación de la República del Ecuador.
23.2. Los derechos reconocidos a los consumidores por la Ley Orgánica de Defensa del Consumidor y demás legislación ecuatoriana son irrenunciables y permanecerán vigentes independientemente de lo establecido en los presentes Términos.
23.3. Cualquier controversia será gestionada inicialmente mediante los canales de atención de BINGO+, sin perjuicio del derecho del Cliente de acudir a las autoridades competentes y a los mecanismos establecidos por la legislación aplicable.

24. ACEPTACIÓN
24.1. El Cliente declara que, antes de crear su cuenta, tuvo acceso a los presentes Términos.
24.2. La aceptación se registrará al seleccionar la casilla "Acepto los Términos y Condiciones de BINGO+.". BINGO+ conservará evidencia de la aceptación electrónica, incluyendo usuario, versión del documento, fecha, hora y dirección IP, de conformidad con la Ley de Comercio Electrónico, Firmas Electrónicas y Mensajes de Datos.`;

interface PublicLegalInfo {
  legalName: string;
  taxId: string;
  addressLine: string;
  privacyEmail: string | null;
}

function resolveText(legal: PublicLegalInfo): string {
  return CUSTOMER_TERMS_TEXT.replaceAll('{{razon_social_bingoplus}}', legal.legalName)
    .replaceAll('{{ruc_bingoplus}}', legal.taxId)
    .replaceAll('{{direccion_bingoplus}}', legal.addressLine);
}

export default function CustomerTermsModal({ onClose }: { onClose: () => void }) {
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
            Términos y Condiciones de Uso de la Plataforma BINGO+
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
          {legal && <TermsDocument text={resolveText(legal)} />}
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
