import Link from 'next/link';
import { t } from '@/lib/i18n';
import { InstallPrompt } from '@/components/InstallPrompt';

export default function LandingPage() {
  const d = t();
  return (
    <div className="space-y-6">
      <section className="card space-y-3">
        <h1 className="text-2xl font-bold">{d.landing.title}</h1>
        <p className="text-slate-700">{d.landing.intro}</p>
        <Link href="/scan" className="btn-primary w-full">
          {d.landing.cta}
        </Link>
        <InstallPrompt label={d.landing.install} />
      </section>
      <section className="card">
        <h2 className="mb-2 text-lg font-semibold">{d.landing.howTitle}</h2>
        <ol className="list-decimal space-y-2 pl-5 text-slate-700">
          {d.landing.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </section>
      <section className="card">
        <h2 className="mb-2 text-lg font-semibold">{d.landing.privacyTitle}</h2>
        <p className="text-slate-700">{d.landing.privacy}</p>
      </section>
    </div>
  );
}
