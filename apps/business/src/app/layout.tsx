import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta' });

export const metadata: Metadata = {
  title: 'BINGO+ Business',
  description: 'Opera tus pedidos con BINGO+.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Unlike Customer/Rider (phone-shaped, capped at 480px everywhere), the Business Portal is a
  // desktop-first dashboard — the width cap now lives per-page (DashboardShell for the app,
  // `.bingo-app-narrow` for the login/select-business auth screens) instead of globally here.
  return (
    <html lang="es" className={jakarta.variable}>
      <body>{children}</body>
    </html>
  );
}
