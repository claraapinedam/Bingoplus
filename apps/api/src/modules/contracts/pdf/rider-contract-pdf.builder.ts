import PDFDocument from 'pdfkit';

export interface RiderContractPdfInput {
  contractId: string;
  idType: 'RUC' | 'CEDULA' | 'PASAPORTE';
  legalName: string;
  taxId: string;
  contractBodyText: string;
  bingoplusRepresentativeName: string;
  /** Fetched bytes of PlatformLegalInfo.signatureImageUrl — null when BINGO+ hasn't uploaded one
   * yet, in which case this section falls back to a plain text label with no image. */
  bingoplusSignatureImage: Buffer | null;
  signedAt: Date;
  signedIp: string;
  /** Decoded PNG bytes from the rider's drawn signature canvas. */
  signatureImage: Buffer;
}

// Cheap line-classifiers for the already-resolved contract text — mirrors contract-pdf.builder.ts
// (BusinessContract) exactly, just with this document's own section-header vocabulary (no "ANEXO
// COMERCIAL"/"DATOS DEL NEGOCIO" here — this one has "ANEXO OPERATIVO"/"DATOS DEL RIDER").
function isClauseHeader(line: string): boolean {
  return /^CLÁUSULA\s/.test(line);
}

function isSectionHeader(line: string): boolean {
  return (
    /^\d+\.\s/.test(line) ||
    [
      'CONTRATO DE PRESTACIÓN DE SERVICIOS DE ENTREGA',
      'Y USO DE LA PLATAFORMA BINGO+',
      'COMPARECIENTES',
      'ANEXO OPERATIVO',
      'DATOS DEL RIDER',
    ].includes(line)
  );
}

/**
 * Renders the signed rider contract to a PDF buffer entirely in memory — mirrors
 * contract-pdf.builder.ts (BusinessContract) exactly: `contractBodyText` is the full,
 * already-resolved contract (title, COMPARECIENTES, every clause, and the Anexo Operativo), so
 * this builder only lays it out and appends the actual signature artifacts (both BINGO+'s uploaded
 * signature image and the rider's own drawn one, plus the signing timestamp/IP stamp) — no
 * separate comparecientes summary, which would otherwise duplicate what the text itself states.
 */
export function buildRiderContractPdf(input: RiderContractPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(9).font('Helvetica').fillColor('#666').text(`ID de contrato: ${input.contractId}`, { align: 'right' });
    doc.fillColor('black');
    doc.moveDown(0.8);

    for (const line of input.contractBodyText.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) {
        doc.moveDown(0.6);
      } else if (isClauseHeader(trimmed) || isSectionHeader(trimmed)) {
        doc.moveDown(0.4);
        doc.fontSize(11).font('Helvetica-Bold').text(trimmed, { align: 'left' });
        doc.fontSize(10).font('Helvetica');
      } else {
        doc.fontSize(10).font('Helvetica').text(trimmed, { align: 'justify', lineGap: 2 });
      }
    }
    doc.moveDown(1.5);

    if (doc.y > doc.page.height - 200) doc.addPage();
    doc.fontSize(12).font('Helvetica-Bold').text('FIRMA DIGITAL DE BINGO+');
    doc.moveDown(0.5);
    if (input.bingoplusSignatureImage) {
      doc.image(input.bingoplusSignatureImage, { fit: [220, 90] });
      doc.moveDown(0.3);
    }
    doc.font('Helvetica').text(`Por BINGO+ — ${input.bingoplusRepresentativeName}`);
    doc.moveDown(1.2);

    doc.fontSize(12).font('Helvetica-Bold').text('FIRMA DIGITAL DE EL RIDER');
    doc.moveDown(0.5);

    if (doc.y > doc.page.height - 200) doc.addPage();
    doc.image(input.signatureImage, { fit: [220, 90] });
    doc.moveDown(0.3);
    doc.font('Helvetica').text(`Por el Rider — ${input.legalName} — ${input.idType} ${input.taxId}`);
    doc.text(`Firmado el ${input.signedAt.toLocaleString('es-EC')} desde la IP ${input.signedIp}`);

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const bottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc
        .fontSize(8)
        .fillColor('#888')
        .text(
          `ID de contrato: ${input.contractId} · Firmado desde IP ${input.signedIp} · Página ${i + 1} de ${range.count}`,
          50,
          doc.page.height - 40,
          { width: doc.page.width - 100, align: 'center', lineBreak: false },
        );
      doc.page.margins.bottom = bottomMargin;
    }

    doc.end();
  });
}
