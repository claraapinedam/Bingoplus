import PDFDocument from 'pdfkit';

export interface ContractPdfInput {
  contractId: string;
  idType: 'RUC' | 'CEDULA';
  legalName: string;
  representativeName: string | null;
  taxId: string;
  contractBodyText: string;
  bingoplusRepresentativeName: string;
  /** Fetched bytes of PlatformLegalInfo.signatureImageUrl — null when BINGO+ hasn't uploaded one
   * yet, in which case this section falls back to a plain text label with no image. */
  bingoplusSignatureImage: Buffer | null;
  signedAt: Date;
  signedIp: string;
  /** Decoded PNG bytes from the business's drawn signature canvas. */
  signatureImage: Buffer;
}

// Cheap line-classifiers for the already-resolved contract text, so clause/section headings get
// bolded instead of the whole thing rendering as one undifferentiated block of prose — mirrors the
// same detection the business/admin frontends use to format this identical string.
function isClauseHeader(line: string): boolean {
  return /^CLÁUSULA\s/.test(line);
}

function isSectionHeader(line: string): boolean {
  return (
    /^\d+\.\s/.test(line) ||
    ['CONTRATO DE AFILIACIÓN Y USO DE LA PLATAFORMA BINGO+', 'COMPARECIENTES', 'ANEXO COMERCIAL', 'DATOS DEL NEGOCIO'].includes(
      line,
    )
  );
}

/**
 * Renders the signed contract to a PDF buffer entirely in memory (no temp files). The unique
 * contract id and signing IP are stamped on every page's footer — written in a second pass after
 * all content flows (via `bufferPages`), since pdfkit only knows the final page count once the
 * body text has actually been laid out. That footer is the "garantía digital de validez" the
 * contract calls for, alongside the drawn signature image itself.
 *
 * `contractBodyText` is the full, already-resolved contract — title, COMPARECIENTES, every
 * clause, and the Anexo Comercial (see ContractTemplateService's BUSINESS default) — so this
 * builder only lays it out and appends the actual signature artifacts (the drawn PNG plus the
 * signing timestamp/IP stamp); it no longer renders its own separate comparecientes summary,
 * which would otherwise duplicate what the text itself already states.
 */
export function buildContractPdf(input: ContractPdfInput): Promise<Buffer> {
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

    doc.fontSize(12).font('Helvetica-Bold').text('FIRMA DIGITAL DE EL NEGOCIO');
    doc.moveDown(0.5);

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
