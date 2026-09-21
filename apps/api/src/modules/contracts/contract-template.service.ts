import { Injectable } from '@nestjs/common';
import { ContractTemplateType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// Exactly today's hardcoded prose, just with the two figure-dependent sentences swapped for a
// placeholder token — until Admin edits the template, generated contracts read identically to
// before this existed.
export const DEFAULT_BUSINESS_CONTRACT_TEMPLATE = [
  'CLÁUSULA PRIMERA — OBJETO. Mediante el presente contrato, BINGO+ concede al Negocio acceso a su plataforma tecnológica para la promoción, venta y/o prestación de productos y servicios dirigidos a mascotas, en los términos y condiciones aquí establecidos.',
  'CLÁUSULA SEGUNDA — TARIFAS Y COMISIONES. {{tarifas_comisiones}}',
  'CLÁUSULA TERCERA — OBLIGACIONES DEL NEGOCIO. El Negocio se compromete a mantener información veraz y actualizada, cumplir con la normativa sanitaria y comercial aplicable, atender oportunamente los pedidos y reservas recibidos a través de BINGO+, y responder por la calidad de los productos y servicios ofrecidos.',
  'CLÁUSULA CUARTA — OBLIGACIONES DE BINGO+. BINGO+ se compromete a mantener disponible la plataforma con niveles razonables de servicio, procesar los pagos correspondientes al Negocio conforme a los plazos establecidos, y brindar soporte técnico razonable durante la vigencia del contrato.',
  'CLÁUSULA QUINTA — VIGENCIA Y TERMINACIÓN. El presente contrato entra en vigencia en la fecha de su firma digital y se mantendrá vigente hasta que cualquiera de las partes lo termine mediante notificación escrita con al menos 30 días de anticipación, sin perjuicio de las obligaciones ya generadas.',
  'CLÁUSULA SEXTA — CONFIDENCIALIDAD Y DATOS PERSONALES. Ambas partes se obligan a mantener confidencialidad sobre la información comercial intercambiada y a tratar los datos personales de los usuarios conforme a la normativa de protección de datos aplicable.',
  'CLÁUSULA SÉPTIMA — VALIDEZ DE LA FIRMA DIGITAL. Las partes reconocen y aceptan que la firma digital consignada en este documento, junto con el identificador único de contrato y la dirección IP registrada al momento de la firma, constituyen prueba suficiente de la manifestación de voluntad y aceptación de los términos aquí descritos.',
].join('\n\n');

export const DEFAULT_RIDER_CONTRACT_TEMPLATE = [
  'CLÁUSULA PRIMERA — OBJETO. Mediante el presente contrato, BINGO+ concede al Rider acceso a su plataforma tecnológica para recibir y ejecutar entregas de pedidos a través de la aplicación BINGO+ Rider, en los términos y condiciones aquí establecidos.',
  'CLÁUSULA SEGUNDA — TARIFAS, COMISIÓN Y RETENCIÓN. La tarifa de cada entrega la calcula BINGO+ según su fórmula vigente (tarifa mínima según franja horaria, distancia recorrida, tiempo y demanda). Sobre esa tarifa, BINGO+ retiene una comisión del {{comision_bingo}}%. Sobre el monto restante, BINGO+ retiene además un {{retencion_impuesto}}% en concepto de impuestos, transfiriendo al Rider el valor neto resultante.',
  'CLÁUSULA TERCERA — OBLIGACIONES DEL RIDER. El Rider se compromete a mantener actualizada su información personal, de identificación y de vehículo, a ejecutar las entregas aceptadas dentro de tiempos razonables y con el debido cuidado de los productos transportados, y a cumplir con la normativa de tránsito aplicable.',
  'CLÁUSULA CUARTA — OBLIGACIONES DE BINGO+. BINGO+ se compromete a mantener disponible la plataforma con niveles razonables de servicio, a transferir al Rider el valor neto de cada entrega completada conforme a los plazos establecidos, y a brindar soporte razonable durante la vigencia del contrato.',
  'CLÁUSULA QUINTA — VIGENCIA Y TERMINACIÓN. El presente contrato entra en vigencia en la fecha de su firma digital y se mantendrá vigente hasta que cualquiera de las partes lo termine mediante notificación escrita con al menos 30 días de anticipación, sin perjuicio de las obligaciones ya generadas.',
  'CLÁUSULA SEXTA — CONFIDENCIALIDAD Y DATOS PERSONALES. Ambas partes se obligan a mantener confidencialidad sobre la información comercial intercambiada y a tratar los datos personales de los usuarios conforme a la normativa de protección de datos aplicable.',
  'CLÁUSULA SÉPTIMA — VALIDEZ DE LA FIRMA DIGITAL. Las partes reconocen y aceptan que la firma digital consignada en este documento, junto con el identificador único de contrato y la dirección IP registrada al momento de la firma, constituyen prueba suficiente de la manifestación de voluntad y aceptación de los términos aquí descritos.',
].join('\n\n');

/**
 * Admin-editable contract template text (append-only, latest wins — same shape as
 * PricingConfigService). ContractsService/RiderContractsService read the latest template at
 * contract-GENERATION time and substitute its {{...}} placeholder tokens with that business/
 * rider's actual live figures; the result is frozen onto the contract row itself, so editing the
 * template here never changes a contract someone already signed (see BusinessContract.contractText/
 * RiderContract.contractText).
 */
@Injectable()
export class ContractTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  async get(type: ContractTemplateType): Promise<string> {
    const row = await this.prisma.contractTemplate.findFirst({ where: { type }, orderBy: { createdAt: 'desc' } });
    if (row) return row.content;
    return type === ContractTemplateType.BUSINESS ? DEFAULT_BUSINESS_CONTRACT_TEMPLATE : DEFAULT_RIDER_CONTRACT_TEMPLATE;
  }

  async set(type: ContractTemplateType, content: string, updatedBy?: string): Promise<string> {
    await this.prisma.contractTemplate.create({ data: { type, content, updatedBy } });
    return content;
  }
}
