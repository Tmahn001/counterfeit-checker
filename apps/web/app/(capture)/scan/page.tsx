'use client';
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CameraCapture } from '@/components/CameraCapture';
import { ProductPicker } from '@/components/ProductPicker';
import { ScanProgress } from '@/components/ScanProgress';
import { VerdictCard } from '@/components/VerdictCard';
import { useScanFlow } from '@/lib/scan/useScanFlow';
import { isBusy } from '@/lib/scan/machine';
import { saveLastResult } from '@/lib/scan/storage';
import { t } from '@/lib/i18n';

export default function ScanPage() {
  const d = t();
  const router = useRouter();
  const flow = useScanFlow();
  const [product, setProduct] = useState('');
  const busy = isBusy(flow.state);

  const onCapture = useCallback(
    (frame: ImageData) => {
      void flow.scan(frame, product).then((result) => {
        if (result) saveLastResult(result);
      });
    },
    [flow, product],
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{d.scan.title}</h1>

      {flow.engine.phase === 'loading' && (
        <div className="card space-y-2" role="status">
          <p className="text-sm">
            {flow.engine.stage === 'model' && flow.engine.progress > 0
              ? d.scan.downloading
              : d.scan.preparing}
          </p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="bg-brand-600 h-full transition-all"
              style={{ width: `${Math.round(flow.engine.progress * 100)}%` }}
            />
          </div>
        </div>
      )}
      {flow.engine.phase === 'failed' && (
        <div className="card border-danger-500" role="alert">
          <p className="font-medium">{d.errors.modelLoad}</p>
          <p className="mt-1 text-xs text-slate-600">{flow.engine.message}</p>
          <button className="btn-secondary mt-3 w-full" onClick={() => window.location.reload()}>
            {d.errors.retry}
          </button>
        </div>
      )}
      {flow.engine.phase === 'ready' && flow.engine.backend !== 'webgl' && (
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{d.scan.slowBackend}</p>
      )}

      <ProductPicker
        label={d.scan.chooseProduct}
        pendingSuffix={d.scan.referencePending}
        value={product}
        onChange={setProduct}
      />

      {flow.state.status === 'result' ? (
        <>
          <VerdictCard result={flow.state.result} onReset={flow.reset} />
          <button className="btn-secondary w-full" onClick={() => router.push('/scan/result')}>
            {d.result.details}
          </button>
        </>
      ) : flow.state.status === 'error' ? (
        <div className="card border-danger-500 space-y-3" role="alert">
          <p className="font-medium">
            {flow.state.code === 'camera_denied'
              ? d.scan.cameraDenied
              : flow.state.code === 'camera_unavailable'
                ? d.scan.cameraUnavailable
                : flow.state.code === 'camera_insecure'
                  ? d.scan.cameraInsecure
                  : flow.state.code === 'no_baseline'
                    ? d.errors.noBaseline
                    : flow.state.code === 'model_load'
                      ? d.errors.modelLoad
                      : d.errors.generic}
          </p>
          <p className="text-xs text-slate-600">{flow.state.message}</p>
          <button className="btn-primary w-full" onClick={flow.reset}>
            {d.errors.retry}
          </button>
        </div>
      ) : (
        <>
          {busy && <ScanProgress state={flow.state} />}
          <CameraCapture
            disabled={busy || flow.engine.phase !== 'ready' || !product}
            onCapture={onCapture}
            onError={flow.fail}
          />
        </>
      )}
    </div>
  );
}
