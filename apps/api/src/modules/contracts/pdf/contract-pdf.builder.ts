import PDFDocument from 'pdfkit';

export interface ContractPdfInput {
  contractId: string;
  idType: 'RUC' | 'CEDULA';
  legalName: string;
  representativeName: string | null;
  taxId: string;
  contractBodyText: string;
  bingoplusRepresentativeName: string;
  bingoplusRuc: string;
  signedAt: Date;
  signedIp: string;
  /** Decoded PNG bytes from the business's drawn signature canvas. */
  signatureImage: Buffer;
}

/**
 * Renders the signed contract to a PDF buffer entirely in memory (no temp files). The unique
 * contract id and signing IP are stamped on every page's footer — written in a second pass after
 * all content flows (via `bufferPages`), since pdfkit only knows the final page count once the
 * body text has actually been laid out. That footer is the "garantía digital de validez" the
 * contract calls for, alongside the drawn signature image itself.
 */
export function buildContractPdf(input: ContractPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).font('Helvetica-Bold').text('Contrato de Afiliación de Negocio — BINGO+', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(9).font('Helvetica').fillColor('#666').text(`ID de contrato: ${input.contractId}`, { align: 'center' });
    doc.fillColor('black');
    doc.moveDown(1.5);

    doc.fontSize(12).font('Helvetica-Bold').text('Comparecientes');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica');
    doc.text(`BINGO+, representado por ${input.bingoplusRepresentativeName}, RUC ${input.bingoplusRuc} (en adelante, "BINGO+").`);
    doc.moveDown(0.3);
    if (input.idType === 'RUC') {
      doc.text(
        `${input.legalName}, representado por ${input.representativeName}, RUC ${input.taxId} (en adelante, "el Negocio").`,
      );
    } else {
      doc.text(`${input.legalName}, cédula de identidad ${input.taxId} (en adelante, "el Negocio").`);
    }
    doc.moveDown(1.2);

    doc.fontSize(10).text(input.contractBodyText, { align: 'justify', lineGap: 2 });
    doc.moveDown(1.5);

    doc.fontSize(12).font('Helvetica-Bold').text('Firmas');
    doc.moveDown(0.5);

    doc.fontSize(10).font('Helvetica-Oblique').text(`/f/ ${input.bingoplusRepresentativeName}`);
    doc.font('Helvetica').text(`Por BINGO+ — RUC ${input.bingoplusRuc}`);
    doc.moveDown(1);

    if (doc.y > doc.page.height - 200) doc.addPage();
    doc.image(input.signatureImage, { fit: [220, 90] });
    doc.moveDown(0.3);
    doc.font('Helvetica').text(
      input.idType === 'RUC' ? `Por el Negocio — ${input.representativeName} (${input.legalName})` : `Por el Negocio — ${input.legalName}`,
    );
    doc.text(`Firmado el ${input.signedAt.toLocaleString('es-EC')} desde la IP ${input.signedIp}`);

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      // Writing this close to the bottom edge would otherwise make pdfkit's own auto-pagination
      // think the footer itself overflows the page and silently spawn a spurious extra page —
      // zeroing the bottom margin for this one write is the standard pdfkit workaround.
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
