import Link from 'next/link';
import { t } from '@/lib/i18n';

export function Header() {
  const d = t();
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-lg items-center justify-between px-4 py-3"
      >
        <Link href="/" className="text-brand-700 flex items-center gap-2 text-lg font-bold">
          <span aria-hidden className="bg-brand-600 inline-block h-6 w-6 rounded-md" />
          {d.app.name}
        </Link>
        <div className="flex items-center gap-4 text-sm font-medium">
          <Link href="/scan" className="hover:text-brand-700 text-slate-700">
            {d.nav.scan}
          </Link>
          <Link href="/oem/login" className="hover:text-brand-700 text-slate-700">
            {d.nav.oem}
          </Link>
          <Link href="/admin" className="hover:text-brand-700 text-slate-700">
            {d.nav.admin}
          </Link>
        </div>
      </nav>
    </header>
  );
}
