/**
 * Engine worker: owns OpenCV.js, the TF.js model and the authentication pipeline so the UI thread
 * never parses the 10 MB vision bundle or runs inference (plan §14: TTI < 3 s on mid-tier devices).
 *
 * Hosting note: this script's own response headers set the worker's Content-Security-Policy. The
 * WebAssembly backend (Safari's path) needs 'unsafe-eval' there, so chunk scripts get a relaxed
 * policy while the page keeps the strict one (apps/web/vercel.json, infra/nginx/prod.conf).
 */
import { currentBackend } from '../inference/backend';
import { PipelineError, prepareEngine, runPipeline, type Engine } from './pipeline';
import type { FromWorker, ToWorker } from './protocol';

const ctx = self as unknown as {
  postMessage: (m: FromWorker) => void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
};
let engine: Engine | null = null;

const post = (m: FromWorker) => ctx.postMessage(m);

ctx.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === 'prepare') {
    prepareEngine({
      modelManifestUrl: msg.modelManifestUrl,
      baselinesUrl: msg.baselinesUrl,
      onStage: (stage) => post({ type: 'stage', stage }),
      onModelProgress: (fraction) => post({ type: 'progress', fraction }),
    })
      .then((eng) => {
        engine = eng;
        post({ type: 'ready', backend: currentBackend(), modelVersion: eng.metadata.modelVersion });
      })
      .catch((err: unknown) =>
        post({ type: 'prepare-error', message: err instanceof Error ? err.message : String(err) }),
      );
    return;
  }
  if (msg.type === 'scan') {
    if (!engine) {
      post({ type: 'scan-error', id: msg.id, code: 'pipeline', message: 'engine not ready' });
      return;
    }
    const frame = new ImageData(
      new Uint8ClampedArray(msg.frame.data),
      msg.frame.width,
      msg.frame.height,
    );
    runPipeline({
      engine,
      frame,
      productCategory: msg.productCategory,
      dispatch: (event) => post({ type: 'event', id: msg.id, event }),
    })
      .then((result) => post({ type: 'result', id: msg.id, result }))
      .catch((err: unknown) =>
        post({
          type: 'scan-error',
          id: msg.id,
          code: err instanceof PipelineError ? err.code : 'pipeline',
          message: err instanceof Error ? err.message : String(err),
        }),
      );
  }
};
