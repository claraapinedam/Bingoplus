// Renders the already-resolved contract text (see ContractTemplateService's RIDER default on the
// API — the two-line title, COMPARECIENTES, every CLÁUSULA, and the ANEXO OPERATIVO, all as one
// plain string with '\n\n' between paragraphs and '\n' within one) as an actual legal document
// instead of one undifferentiated pre-wrapped text block: the title centered, clause/section
// headers bolded, body text justified. Mirrors the exact same line-classification the signed PDF
// uses (apps/api/src/modules/contracts/pdf/rider-contract-pdf.builder.ts's isClauseHeader/
// isSectionHeader), so what a rider reads on screen before signing looks like what actually gets
// stamped and stored — not a plainer preview of a fancier document.
const DOC_TITLE_LINES = new Set(['CONTRATO DE PRESTACIÓN DE SERVICIOS DE ENTREGA', 'Y USO DE LA PLATAFORMA BINGO+']);
const ANEXO_SUBTITLE = 'AL CONTRATO DE PRESTACIÓN DE SERVICIOS DE ENTREGA Y USO DE LA PLATAFORMA BINGO+';
const SECTION_HEADERS = new Set(['COMPARECIENTES', 'ANEXO OPERATIVO', 'DATOS DEL RIDER']);

function isClauseHeader(line: string): boolean {
  return /^CLÁUSULA\s/.test(line);
}

function isSectionHeader(line: string): boolean {
  return /^\d+\.\s/.test(line) || SECTION_HEADERS.has(line);
}

export default function ContractDocument({ text }: { text: string }) {
  const paragraphs = text.split('\n\n');

  return (
    <div style={{ fontFamily: 'Georgia, "Times New Roman", serif', color: '#1a1a1a' }}>
      {paragraphs.map((paragraph, pi) => (
        <div key={pi} style={{ marginBottom: 14 }}>
          {paragraph.split('\n').map((rawLine, li) => {
            const line = rawLine.trim();
            if (!line) return null;

            if (DOC_TITLE_LINES.has(line)) {
              return (
                <h1 key={li} style={{ textAlign: 'center', fontSize: 16, fontWeight: 800, margin: '4px 0 10px' }}>
                  {line}
                </h1>
              );
            }
            if (line === ANEXO_SUBTITLE) {
              return (
                <p key={li} style={{ textAlign: 'center', fontStyle: 'italic', fontSize: 12, margin: '0 0 6px', color: '#54617a' }}>
                  {line}
                </p>
              );
            }
            if (isClauseHeader(line) || isSectionHeader(line)) {
              return (
                <div key={li} style={{ fontWeight: 800, fontSize: 13, margin: li === 0 ? '0 0 4px' : '10px 0 4px' }}>
                  {line}
                </div>
              );
            }
            return (
              <p key={li} style={{ textAlign: 'justify', fontSize: 12.5, lineHeight: 1.7, margin: '0 0 4px' }}>
                {line}
              </p>
            );
          })}
        </div>
      ))}
    </div>
  );
}
