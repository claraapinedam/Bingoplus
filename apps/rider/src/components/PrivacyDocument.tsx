// Renders the real "Política de Privacidad y Tratamiento de Datos Personales — Riders BINGO+"
// document — sibling to TermsDocument.tsx in this app (same title-centered/headers-bold/body-
// justified treatment), and structurally identical to it here (two-line title, "PREÁMBULO" header,
// two-level "N."/"N.N." numbered headers) since both rider documents share the same shape, unlike
// the business app where Terms and Privacy needed different header regexes.
const DOC_TITLE_LINES = new Set(['POLÍTICA DE PRIVACIDAD Y TRATAMIENTO DE DATOS PERSONALES', 'RIDERS BINGO+']);
const SECTION_HEADERS = new Set(['PREÁMBULO']);

function isSectionHeader(line: string): boolean {
  return /^\d+(\.\d+)?\.\s/.test(line) || SECTION_HEADERS.has(line);
}

export default function PrivacyDocument({ text }: { text: string }) {
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
