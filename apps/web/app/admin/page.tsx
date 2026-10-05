'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import type {
  DashboardSummary,
  ModelVersionResponse,
  ProductCatalogueResponse,
  SessionUser,
} from '@authentic-edge/shared-types';
import { api, ApiError } from '@/lib/api/client';
import { env } from '@/lib/env';
import { t } from '@/lib/i18n';

type Tab = 'overview' | 'products' | 'models';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

export default function AdminConsolePage() {
  const d = t();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [catalogue, setCatalogue] = useState<ProductCatalogueResponse | null>(null);
  const [models, setModels] = useState<ModelVersionResponse[]>([]);

  const load = useCallback((u: SessionUser) => {
    api
      .products()
      .then(setCatalogue)
      .catch(() => setCatalogue(null));
    api
      .models()
      .then(setModels)
      .catch(() => setModels([]));
    if (u.roles.includes('nafdac'))
      api
        .dashboard(30)
        .then(setSummary)
        .catch(() => setSummary(null));
  }, []);

  useEffect(() => {
    api.auth
      .me()
      .then((u) => {
        setUser(u);
        load(u);
      })
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, [load]);

  const signIn = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const u = await api.auth.login(email, password);
      setUser(u);
      setTab('overview');
      setPassword('');
      load(u);
    } catch (err: unknown) {
      setError(
        err instanceof ApiError && err.status === 400
          ? 'Invalid email or password.'
          : d.errors.generic,
      );
    }
  };

  if (checking) return <p className="text-sm text-slate-600">…</p>;

  if (!user) {
    return (
      <form onSubmit={(e) => void signIn(e)} className="card space-y-4">
        <h1 className="text-xl font-bold">{d.admin.title}</h1>
        <p className="text-sm text-slate-600">{d.admin.signInHint}</p>
        <label className="block space-y-1">
          <span className="text-sm font-medium">{d.oem.email}</span>
          <input
            className="input"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">{d.oem.password}</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="text-danger-600 text-sm">
            {error}
          </p>
        )}
        <button className="btn-primary w-full" type="submit">
          {d.oem.signIn}
        </button>
      </form>
    );
  }

  const products = catalogue?.products.filter((p) => p.sector !== 'demo') ?? [];
  const scannable = products.filter((p) => p.baseline).length;
  const activeModel = catalogue?.model_version ?? '–';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{d.admin.title}</h1>
        <button
          className="text-sm font-medium text-slate-600 underline"
          onClick={() => {
            void api.auth.logout().finally(() => {
              setUser(null);
              setSummary(null);
            });
          }}
        >
          {d.oem.signOut}
        </button>
      </div>
      <p className="text-sm text-slate-700">
        {user.email} · {user.roles.join(', ') || 'no console roles'}
      </p>

      <div role="tablist" className="grid grid-cols-3 gap-2">
        {(['overview', 'products', 'models'] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            className={`rounded-xl px-3 py-2 text-sm font-semibold ${tab === k ? 'bg-brand-600 text-white' : 'border border-slate-300 bg-white text-slate-800'}`}
            onClick={() => setTab(k)}
          >
            {d.admin[k]}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <section className="space-y-4" data-testid="admin-overview">
          <div className="grid grid-cols-2 gap-3">
            <Stat
              label={`${d.admin.totalScans} · ${d.admin.window}`}
              value={summary ? String(summary.total_events) : '–'}
            />
            <Stat
              label={d.admin.counterfeitRate}
              value={summary ? `${Math.round(summary.counterfeit_rate * 100)}%` : '–'}
            />
            <Stat label={d.admin.scannable} value={`${scannable} / ${products.length}`} />
            <Stat label={d.admin.activeModel} value={activeModel} />
          </div>
          {!user.roles.includes('nafdac') ? (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{d.admin.noAccess}</p>
          ) : (
            summary && (
              <>
                <div className="card">
                  <h2 className="mb-2 font-semibold">{d.admin.byCategory}</h2>
                  {summary.by_category_state.length === 0 ? (
                    <p className="text-sm text-slate-600">{d.admin.noCells}</p>
                  ) : (
                    <table className="w-full text-sm">
                      <tbody>
                        {summary.by_category_state.map((c) => (
                          <tr
                            key={`${c.product_category}-${c.state_code}-${c.verdict}`}
                            className="border-t border-slate-100"
                          >
                            <td className="py-1.5">{c.product_category}</td>
                            <td>{c.state_code || '–'}</td>
                            <td>{c.verdict}</td>
                            <td className="text-right font-semibold">{c.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <p className="mt-2 text-xs text-slate-500">
                    {d.admin.suppressed(summary.k_anonymity)}
                  </p>
                </div>
                <div className="card">
                  <h2 className="mb-2 font-semibold">{d.admin.byVersion}</h2>
                  <ul className="text-sm">
                    {Object.entries(summary.by_model_version).map(([v, n]) => (
                      <li key={v} className="flex justify-between border-t border-slate-100 py-1.5">
                        <span>{v}</span>
                        <span className="font-semibold">{n}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )
          )}
        </section>
      )}

      {tab === 'products' && (
        <section className="card space-y-2" data-testid="admin-products">
          <ul className="text-sm">
            {products.map((p) => (
              <li
                key={p.slug}
                className="flex items-start justify-between gap-3 border-t border-slate-100 py-2 first:border-t-0"
              >
                <span>
                  <span className="font-medium">{p.display_name}</span>
                  <span className="block text-xs text-slate-500">
                    {p.manufacturer} · {p.pack}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${p.baseline ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-700'}`}
                >
                  {p.baseline ? `${d.admin.ready} · ${p.baseline.image_count}` : d.admin.pending}
                </span>
              </li>
            ))}
          </ul>
          <Link href="/oem/login" className="btn-secondary w-full">
            {d.admin.enrol}
          </Link>
        </section>
      )}

      {tab === 'models' && (
        <section className="card" data-testid="admin-models">
          <ul className="text-sm">
            {models.map((m) => (
              <li
                key={m.version_string}
                className="border-t border-slate-100 py-2 first:border-t-0"
              >
                <span className="font-medium">
                  {m.version_string}
                  {m.version_string === activeModel ? ' · active' : ''}
                </span>
                <span className="block text-xs text-slate-500">
                  threshold margin {m.margin} · input {m.input_size}px ·{' '}
                  {m.published_at ? new Date(m.published_at).toLocaleDateString() : 'unpublished'}
                </span>
                {m.release_notes && (
                  <span className="block text-xs text-slate-600">{m.release_notes}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {user.roles.includes('staff') && (
        <section className="card space-y-1">
          <a
            className="text-brand-700 font-semibold underline"
            href={`${env.apiBaseUrl}/django-admin/`}
            target="_blank"
            rel="noreferrer"
          >
            {d.admin.rawData}
          </a>
          <p className="text-xs text-slate-600">{d.admin.rawDataHint}</p>
        </section>
      )}
    </div>
  );
}
