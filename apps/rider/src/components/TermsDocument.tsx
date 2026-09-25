// Renders the real "Términos y Condiciones de Uso de la Plataforma BINGO+ — Riders" text the same
// way apps/business/src/components/TermsDocument.tsx renders its own Terms document (title
// centered, section headers bolded, body justified) — not a copy of it: this document's title is
// two lines ("TÉRMINOS Y CONDICIONES..." / "RIDERS"), it has a "PREÁMBULO" header like the
// business Terms document, but — unlike that one — it also uses sub-numbered "N.N." headers
// throughout (e.g. "1.1.", "14.3."), the same shape apps/business/src/components/PrivacyDocument.tsx
// handles. So the header regex below is PrivacyDocument's two-level `/^\d+(\.\d+)?\.\s/` (which
// already matches a tab after the number, since `\s` covers any whitespace), combined with
// TermsDocument's PREÁMBULO handling.
const DOC_TITLE_LINES = new Set(['TÉRMINOS Y CONDICIONES DE USO DE LA PLATAFORMA BINGO+', 'RIDERS']);
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
