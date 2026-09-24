'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import TermsDocument from './TermsDocument';

// The real "Términos y Condiciones para Negocios BINGO+" document the owner supplied
// (apps/business/public/Terminos_y_Condiciones_Negocios_BINGO+.docx), replacing the old hardcoded
// BUSINESS_TERMS_SECTIONS placeholder prose that used to live in TermsModal. Rendered starting
// from the document's own title — the source docx's version/date header line and the "☐" checkbox
// glyph inside clause 19 are intentionally left out: this app has no version-tracking mechanism
// for this document (out of scope, matches this codebase's rule against fabricating data that
// isn't real), and the checkbox in the form below is the real UI control, so restating it as text
// here would be redundant.
//
// "{{razon_social_bingoplus}}"/"{{ruc_bingoplus}}" mirror the exact placeholder names
// ContractsService uses for the same two values in the affiliation contract — resolved below from
// GET /public/legal-info (legalName/taxId only), never hardcoded.
const BUSINESS_TERMS_TEXT = `TÉRMINOS Y CONDICIONES PARA NEGOCIOS BINGO+
PREÁMBULO
Los presentes Términos y Condiciones para Negocios (en adelante, los "Términos") establecen las reglas de uso de la plataforma tecnológica BINGO+, operada por {{razon_social_bingoplus}}, con RUC No. {{ruc_bingoplus}} (en adelante, "BINGO+"), que deberá observar toda persona natural o jurídica que registre un negocio en la plataforma (en adelante, "EL NEGOCIO").
Los presentes Términos no constituyen el contrato comercial entre las Partes, el cual consta en el Contrato de Afiliación y Uso de la Plataforma BINGO+ y su Anexo Comercial (en adelante, el "Contrato"). Estos Términos contienen el conjunto de reglas que EL NEGOCIO acepta para utilizar BINGO+.

1. ACEPTACIÓN
Al registrar un negocio en BINGO+, EL NEGOCIO declara que ha leído, comprendido y aceptado íntegramente los presentes Términos.
La aceptación electrónica podrá registrarse mediante los mecanismos digitales que BINGO+ implemente para tal efecto.

2. REGISTRO DEL NEGOCIO
EL NEGOCIO deberá proporcionar información verdadera, completa y actualizada. BINGO+ podrá solicitar documentación adicional para verificar:
La identidad de EL NEGOCIO y de su representante;
La existencia del negocio;
La información tributaria;
La actividad económica;
Los permisos;
Las autorizaciones; y,
La titularidad de la cuenta bancaria registrada.

3. MODALIDAD TIENDA
Cuando EL NEGOCIO participe bajo la modalidad TIENDA, podrá publicar productos y recibir pedidos mediante BINGO+. EL NEGOCIO deberá mantener actualizados:
Los precios;
El inventario;
Las fotografías, que deberán ser adecuadas y corresponder al producto ofrecido;
Las descripciones, que deberán ser correctas;
La información de cada producto;
Los horarios de atención; y,
La disponibilidad de los productos.

4. POLÍTICA DE PRODUCTOS
EL NEGOCIO no podrá publicar ni comercializar a través de BINGO+ productos:
Ilegales;
Falsificados;
Adulterados;
Vencidos;
Peligrosos;
Prohibidos por la legislación vigente;
Cuya comercialización requiera una autorización, registro o permiso que EL NEGOCIO no posea; o,
Que puedan poner en riesgo la salud o integridad de mascotas o personas.
BINGO+ podrá retirar, sin necesidad de aviso previo, las publicaciones que incumplan estas condiciones.

5. PEDIDOS
EL NEGOCIO deberá atender oportunamente los pedidos recibidos a través de la plataforma. Para ello, deberá:
Aceptar o rechazar los pedidos oportunamente;
Preparar correctamente cada pedido;
Entregar los productos correspondientes al pedido;
Mantener el pedido correctamente empacado; e,
Informar a BINGO+ cualquier incidencia.
Los incumplimientos reiterados de estas obligaciones podrán generar restricciones en la cuenta o su suspensión.

6. PRODUCTOS Y CALIDAD
EL NEGOCIO es responsable de la calidad y las condiciones de los productos que comercializa. BINGO+ no inspecciona individualmente cada producto.
Las reclamaciones relacionadas con defectos, calidad, composición, vencimiento, estado, cantidad o características de los productos serán gestionadas conforme a la naturaleza del caso y a las responsabilidades legalmente aplicables a cada parte.

7. CANCELACIONES Y DEVOLUCIONES
EL NEGOCIO deberá respetar las políticas de cancelación y devolución aplicables en la plataforma.
Cuando una devolución sea atribuible a EL NEGOCIO, BINGO+ podrá realizar los ajustes correspondientes en la liquidación, de conformidad con el Contrato.
Estas reglas no limitan los derechos que la Ley Orgánica de Defensa del Consumidor y demás normativa aplicable reconocen a los consumidores.

8. DIRECTORIO
Los negocios que contraten la modalidad DIRECTORIO podrán publicar la siguiente información:
Nombre comercial;
Descripción;
Ubicación;
Horarios;
Fotografías;
Servicios;
Medios de contacto;
Promociones; e,
Información comercial.
BINGO+ podrá establecer categorías y requisitos de publicación para el Directorio.

9. SERVICIOS DEL DIRECTORIO
EL NEGOCIO será responsable de los servicios que ofrece a través del Directorio y deberá cumplir con:
Los horarios publicados;
Las reservas confirmadas;
Los precios publicados;
Las condiciones ofrecidas;
La normativa sanitaria aplicable;
Los permisos requeridos;
Las habilitaciones correspondientes; y,
Sus obligaciones profesionales.
BINGO+ no cobra comisión sobre el valor de los servicios ofrecidos a través del Directorio. El fee de Directorio es independiente del número de clientes obtenidos o de servicios contratados.

10. INFORMACIÓN COMERCIAL
EL NEGOCIO deberá mantener su información comercial actualizada. BINGO+ podrá solicitar su modificación cuando detecte información:
Incorrecta;
Incompleta;
Engañosa;
Desactualizada; o,
Potencialmente perjudicial para los usuarios.

11. RESEÑAS
Los usuarios podrán publicar calificaciones y comentarios sobre EL NEGOCIO, sus productos y servicios. BINGO+ podrá retirar el contenido que infrinja las reglas de la plataforma o la legislación aplicable.

12. PROMOCIONES
EL NEGOCIO podrá participar en las promociones que BINGO+ organice o habilite. Las promociones que impliquen descuentos financiados total o parcialmente por EL NEGOCIO requerirán su aceptación previa, conforme al mecanismo establecido por BINGO+.

13. PROPIEDAD INTELECTUAL
EL NEGOCIO garantiza que posee derechos suficientes sobre las imágenes, marcas, fotografías y demás contenidos que publique en BINGO+, y que su uso no infringe derechos de terceros.
EL NEGOCIO no podrá publicar contenido que infrinja derechos de propiedad intelectual o de cualquier otra naturaleza pertenecientes a terceros.

14. CONDUCTAS PROHIBIDAS
Se prohíbe utilizar BINGO+ para:
Cometer fraude;
Realizar estafas;
Desarrollar actividades ilícitas;
Falsificar productos, documentos o información;
Manipular pedidos;
Extraer datos de forma indebida;
Realizar ataques tecnológicos contra la plataforma o sus usuarios;
Suplantar la identidad de terceros;
Publicar información falsa; o,
Realizar actividades que pongan en riesgo a los usuarios.

15. SUSPENSIÓN
BINGO+ podrá suspender publicaciones o cuentas cuando exista incumplimiento de los presentes Términos. Cuando sea posible, BINGO+ comunicará a EL NEGOCIO la causa de la medida adoptada.

16. DISPONIBILIDAD DE LA PLATAFORMA
BINGO+ procurará mantener la disponibilidad de la plataforma. No obstante, EL NEGOCIO reconoce que pueden existir interrupciones ocasionadas por mantenimiento, actualizaciones, fallas técnicas, proveedores externos, servicios de internet, servicios tecnológicos de terceros, caso fortuito o fuerza mayor, conforme a lo previsto en la legislación ecuatoriana.

17. MODIFICACIONES
BINGO+ podrá modificar los presentes Términos cuando sea necesario para:
Actualizar funcionalidades;
Incorporar nuevos servicios;
Mejorar la seguridad;
Cumplir la normativa aplicable; o,
Modificar procesos operativos.
Las modificaciones relevantes serán comunicadas a EL NEGOCIO mediante los mecanismos de notificación disponibles en la plataforma.

18. RELACIÓN CON EL CONTRATO
Los presentes Términos complementan el Contrato de Afiliación y Uso de la Plataforma BINGO+. En caso de contradicción respecto de condiciones económicas, prevalecerán el Contrato y su Anexo Comercial.

19. ACEPTACIÓN DIGITAL
Al seleccionar la casilla "Acepto los Términos y Condiciones para Negocios BINGO+", EL NEGOCIO declara haber leído y aceptado el presente documento. BINGO+ conservará evidencia de la aceptación, incluyendo:
Usuario;
Fecha;
Hora;
Dirección IP;
Versión aceptada de los Términos; e,
Identificación de EL NEGOCIO.
La contratación electrónica y los mensajes de datos tienen reconocimiento jurídico en el Ecuador, de conformidad con la Ley de Comercio Electrónico, Firmas Electrónicas y Mensajes de Datos, el Código de Comercio y demás legislación aplicable.`;

interface PublicLegalInfo {
  legalName: string;
  taxId: string;
}

function resolveText(legal: PublicLegalInfo): string {
  return BUSINESS_TERMS_TEXT.replaceAll('{{razon_social_bingoplus}}', legal.legalName).replaceAll(
    '{{ruc_bingoplus}}',
    legal.taxId,
  );
}

export default function BusinessTermsModal({ onClose }: { onClose: () => void }) {
  const [legal, setLegal] = useState<PublicLegalInfo | null | undefined>(undefined);

  useEffect(() => {
    apiFetch<PublicLegalInfo>('/public/legal-info').then(setLegal).catch(() => setLegal(null));
  }, []);

  return (
    <div className="dashboard-modal-overlay" onClick={onClose}>
      <div className="dashboard-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="dashboard-modal-header">
          <span className="dashboard-modal-title">Términos y Condiciones para Negocios BINGO+</span>
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
