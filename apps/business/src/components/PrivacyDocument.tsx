// Renders the real "Política de Privacidad y Tratamiento de Datos Personales — Negocios BINGO+"
// document — sibling to TermsDocument.tsx (title centered, section headers bolded, body
// justified), not a generalization of it: this document's headers have a shape TermsDocument's
// regex doesn't cover. Its title is two lines (both styled as the title block), and beyond the
// numbered "N. TÍTULO" headers it also has sub-numbered "N.N. Subtítulo" headers (e.g.
// "3.1. Datos del negocio") that must also render bold — TermsDocument's `/^\d+\.\s/` only matches
// a single number before the dot, so "3.1. Datos del negocio" would fall through to body text; the
// regex below adds an optional `.N` group to catch both shapes.
const DOC_TITLE_LINES = new Set([
  'POLÍTICA DE PRIVACIDAD Y TRATAMIENTO DE DATOS PERSONALES',
  'NEGOCIOS BINGO+',
]);

function isSectionHeader(line: string): boolean {
  return /^\d+(\.\d+)?\.\s/.test(line);
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
