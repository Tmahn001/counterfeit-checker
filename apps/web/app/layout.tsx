import type { Metadata, Viewport } from 'next';
import './globals.css';
import { t } from '@/lib/i18n';
import { Header } from '@/components/Header';
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar';

const dict = t();

export const metadata: Metadata = {
  title: dict.app.name,
  description: dict.app.tagline,
  manifest: '/manifest.webmanifest',
  applicationName: dict.app.name,
  appleWebApp: { capable: true, statusBarStyle: 'default', title: dict.app.name },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/icon-192.png' },
};

export const viewport: Viewport = {
  themeColor: '#0b7d46',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-full">
        <a
          href="#main"
          className="sr-only-focusable sr-only fixed left-2 top-2 z-50 rounded bg-white px-3 py-2"
        >
          Skip to content
        </a>
        <Header />
        <main id="main" className="mx-auto w-full max-w-lg px-4 pb-16 pt-4">
          {children}
        </main>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
