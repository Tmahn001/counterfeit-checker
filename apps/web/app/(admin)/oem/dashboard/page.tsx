'use client';
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type {
  ModelVersionResponse,
  OEMMe,
  Product,
  ProductBaseline,
} from '@authentic-edge/shared-types';
import { api, ApiError } from '@/lib/api/client';
import { t } from '@/lib/i18n';
import { CameraCapture } from '@/components/CameraCapture';
import { MAX_PHOTOS, frameToFile, normalizePhoto, uploadHint } from '@/lib/oem/referencePhotos';

interface Shot {
  readonly id: number;
  readonly file: File;
  readonly url: string;
}

const statusStyle: Record<ProductBaseline['status'], string> = {
  pending: 'bg-slate-100 text-slate-700',
  running: 'bg-amber-100 text-amber-800',
  ready: 'bg-brand-50 text-brand-700',
  failed: 'bg-red-50 text-danger-600',
};

export default function OEMDashboardPage() {
  const d = t();
  const router = useRouter();
  const [me, setMe] = useState<OEMMe | null>(null);
  const [model, setModel] = useState<ModelVersionResponse | null>(null);
  const [baselines, setBaselines] = useState<ProductBaseline[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [category, setCategory] = useState('');
  const [shots, setShots] = useState<Shot[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const nextId = useRef(1);
  const shotsRef = useRef<Shot[]>([]);
  shotsRef.current = shots;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setBaselines(await api.oem.baselines());
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 403) router.push('/oem/login');
    }
  }, [router]);

  useEffect(() => {
    api.oem
      .me()
      .then(setMe)
      .catch(() => router.push('/oem/login'));
    api
      .latestModel()
      .then(setModel)
      .catch(() => setModel(null));
    api
      .products()
      .then((r) => setProducts(r.products.filter((p) => p.sector !== 'demo')))
      .catch(() => setProducts([]));
    void refresh();
    const timer = setInterval(() => void refresh(), 5000); // status polling
    return () => clearInterval(timer);
  }, [refresh, router]);

  // Free preview URLs when the page goes away.
  useEffect(() => () => shotsRef.current.forEach((sh) => URL.revokeObjectURL(sh.url)), []);

  const addFiles = useCallback((files: File[]) => {
    setShots((prev) => [
      ...prev,
      ...files.map((file) => ({ id: nextId.current++, file, url: URL.createObjectURL(file) })),
    ]);
  }, []);

  const removeShot = (id: number) =>
    setShots((prev) => {
      const gone = prev.find((sh) => sh.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((sh) => sh.id !== id);
    });

  const clearShots = () =>
    setShots((prev) => {
      prev.forEach((sh) => URL.revokeObjectURL(sh.url));
      return [];
    });

  const onCameraFrame = useCallback(
    (frame: ImageData) => {
      void frameToFile(frame, `camera-${Date.now()}.png`).then((f) => addFiles([f]));
    },
    [addFiles],
  );

  // Files from the device are appended (not replaced) and framed like the scanner frames a capture.
  const onPickFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (picked.length === 0) return;
    setPreparing(true);
    setError(null);
    const ready: File[] = [];
    const failed: string[] = [];
    for (const f of picked) {
      try {
        ready.push(await normalizePhoto(f));
      } catch {
        failed.push(f.name);
      }
    }
    addFiles(ready);
    if (failed.length) setError(failed.map((n) => d.oem.unreadable(n)).join(' '));
    setPreparing(false);
  };

  const hint = uploadHint(Boolean(category), shots.length);
  const hintText =
    hint.key === 'chooseProduct'
      ? d.oem.hint.chooseProduct
      : hint.key === 'needMore'
        ? d.oem.hint.needMore(hint.missing)
        : hint.key === 'tooMany'
          ? d.oem.hint.tooMany
          : d.oem.hint.ready(shots.length);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!hint.ready) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.oem.upload(
        category,
        shots.map((sh) => sh.file),
      );
      clearShots();
      setCameraOpen(false);
      setNotice(d.oem.uploaded);
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : d.errors.generic);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{d.oem.dashboardTitle}</h1>
        <button
          className="text-sm font-medium text-slate-600 underline"
          onClick={() => {
            void api.oem.logout().finally(() => router.push('/oem/login'));
          }}
        >
          {d.oem.signOut}
        </button>
      </div>
      {me && (
        <p className="text-sm text-slate-700">
          {me.account.company_name} · {me.email} · {me.role}
        </p>
      )}
      <p className="text-sm text-slate-700">
        {d.oem.activeModel}: <strong>{model?.version_string ?? '–'}</strong>
      </p>

      <form onSubmit={(e) => void submit(e)} className="card space-y-3">
        <h2 className="font-semibold">{d.oem.upload}</h2>
        <label className="block space-y-1">
          <span className="text-sm font-medium">{d.oem.category}</span>
          <select
            className="input"
            required
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            data-testid="oem-product"
          >
            <option value="">Choose a product…</option>
            {products.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.display_name} — {p.manufacturer}
              </option>
            ))}
          </select>
        </label>
        <details
          className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700"
          open={shots.length === 0}
        >
          <summary className="cursor-pointer font-medium">{d.oem.howTitle}</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            {d.oem.howSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </details>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{d.oem.images}</legend>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={cameraOpen ? 'btn-primary' : 'btn-secondary'}
              onClick={() => {
                setCameraError(null);
                setCameraOpen((o) => !o);
              }}
              data-testid="oem-camera-toggle"
            >
              {cameraOpen ? d.oem.closeCamera : d.oem.takePhotos}
            </button>
            <label className="btn-secondary cursor-pointer">
              {d.oem.chooseFiles}
              <input
                className="sr-only"
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => void onPickFiles(e)}
                data-testid="oem-file-input"
              />
            </label>
          </div>
          {cameraOpen && (
            <CameraCapture
              captureLabel={d.oem.addPhoto}
              disabled={busy || shots.length >= MAX_PHOTOS}
              onCapture={onCameraFrame}
              onError={(_code, message) => {
                setCameraError(message);
                setCameraOpen(false);
              }}
            />
          )}
          {cameraError && (
            <p role="alert" className="text-danger-600 text-sm">
              {cameraError}
            </p>
          )}
          {preparing && <p className="text-sm text-slate-600">{d.oem.processing}</p>}
          {shots.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span data-testid="oem-photo-count">{d.oem.photoCount(shots.length)}</span>
                <button type="button" className="text-slate-600 underline" onClick={clearShots}>
                  {d.oem.clearAll}
                </button>
              </div>
              <ul className="grid grid-cols-4 gap-2">
                {shots.map((sh) => (
                  <li key={sh.id} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
                    <img
                      src={sh.url}
                      alt=""
                      className="aspect-square w-full rounded-lg object-cover"
                    />
                    <button
                      type="button"
                      aria-label={d.oem.remove}
                      className="absolute right-1 top-1 h-7 w-7 rounded-full bg-black/60 text-sm font-bold text-white"
                      onClick={() => removeShot(sh.id)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </fieldset>

        {error && (
          <p role="alert" className="text-danger-600 text-sm">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="bg-brand-50 text-brand-700 rounded-lg p-2 text-sm">
            {notice}
          </p>
        )}
        <p
          className={`text-sm ${hint.ready ? 'text-brand-700' : 'text-slate-700'}`}
          data-testid="oem-upload-hint"
        >
          {hintText}
        </p>
        <button
          className="btn-primary w-full"
          disabled={busy || preparing || !hint.ready}
          type="submit"
          data-testid="oem-submit"
        >
          {busy ? d.oem.uploading : `${d.oem.submit} (${shots.length})`}
        </button>
      </form>

      <section className="card">
        {baselines.length === 0 ? (
          <p className="text-sm text-slate-600">{d.oem.noBaselines}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-600">
                <th className="py-1">{d.oem.category}</th>
                <th>{d.oem.modelVersion}</th>
                <th>{d.oem.status}</th>
              </tr>
            </thead>
            <tbody>
              {baselines.map((b) => (
                <tr key={b.id} className="border-t border-slate-100">
                  <td className="py-2">
                    {products.find((p) => p.slug === b.product_category)?.display_name ??
                      b.product_category}
                    <span className="block text-xs text-slate-500">{b.image_count} images</span>
                  </td>
                  <td>{b.model_version}</td>
                  <td>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle[b.status]}`}
                    >
                      {b.status}
                    </span>
                    {b.error_message && (
                      <span className="text-danger-600 block text-xs">{b.error_message}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
