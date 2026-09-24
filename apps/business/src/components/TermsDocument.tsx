// Renders the real "Términos y Condiciones para Negocios BINGO+" text the same way
// ContractDocument renders the affiliation contract (see that file) — title centered, section
// headers bolded, body justified — so the real legal document reads like one instead of a plain
// wall of text. This document's headers are simpler than the contract's: no "CLÁUSULA"/"ANEXO
// COMERCIAL" tokens, just its own all-caps title line, "PREÁMBULO", and numbered "N. TÍTULO" lines.
const DOC_TITLE = 'TÉRMINOS Y CONDICIONES PARA NEGOCIOS BINGO+';
const SECTION_HEADERS = new Set(['PREÁMBULO']);

function isSectionHeader(line: string): boolean {
  return /^\d+\.\s/.test(line) || SECTION_HEADERS.has(line);
}

export default function TermsDocument({ text }: { text: string }) {
  const paragraphs = text.split('\n\n');

  return (
    <div style={{ fontFamily: 'Georgia, "Times New Roman", serif', color: '#1a1a1a' }}>
      {paragraphs.map((paragraph, pi) => (
        <div key={pi} style={{ marginBottom: 14 }}>
          {paragraph.split('\n').map((rawLine, li) => {
            const line = rawLine.trim();
            if (!line) return null;

            if (line === DOC_TITLE) {
              return (
                <h1 key={li} style={{ textAlign: 'center', fontSize: 16, fontWeight: 800, margin: '4px 0 10px' }}>
                  {line}
                </h1>
              );
            }
            if (isSectionHeader(line)) {
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
