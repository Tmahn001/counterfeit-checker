import Link from 'next/link';
import { t } from '@/lib/i18n';

export default function OfflinePage() {
  const d = t();
  return (
    <div className="card space-y-3 text-center">
      <h1 className="text-xl font-bold">{d.offline.title}</h1>
      <p className="text-slate-700">{d.offline.body}</p>
      <Link href="/scan" className="btn-primary w-full">
        {d.offline.cta}
      </Link>
    </div>
  );
}
