// Renders the real "Términos y Condiciones de Uso de la Plataforma BINGO+ — Clientes" text the
// same way apps/business/src/components/TermsDocument.tsx and apps/rider/src/components/
// TermsDocument.tsx render their own Terms documents (title centered, section headers bolded,
// body justified). This document's title is two lines ("TÉRMINOS Y CONDICIONES..." / "CLIENTES"),
// it has a "PREÁMBULO" header, and it also uses sub-numbered "N.N." headers throughout (e.g.
// "1.1.", "24.2."), the same shape apps/rider's TermsDocument/PrivacyDocument handle — so the
// header regex below is the two-level `/^\d+(\.\d+)?\.\s/`, not the simpler single-level one used
// by apps/business's TermsDocument.
const DOC_TITLE_LINES = new Set(['TÉRMINOS Y CONDICIONES DE USO DE LA PLATAFORMA BINGO+', 'CLIENTES']);
const SECTION_HEADERS = new Set(['PREÁMBULO']);

function isSectionHeader(line: string): boolean {
  return /^\d+(\.\d+)?\.\s/.test(line) || SECTION_HEADERS.has(line);
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

            if (DOC_TITLE_LINES.has(line)) {
              return (
                <h1 key={li} style={{ textAlign: 'center', fontSize: 16, fontWeight: 800, margin: '4px 0 2px' }}>
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
