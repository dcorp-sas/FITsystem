import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: 'FIT system™ · Gestión de gimnasios',
  description: 'Sistema integral de gestión para gimnasios: socios, cuotas, caja, clases y más.',
  icons: { icon: '/logo.png', apple: '/logo.png' },
};

export const viewport: Viewport = {
  themeColor: '#0b1120',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" translate="no">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}