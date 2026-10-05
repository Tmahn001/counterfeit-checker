/**
 * Lazy, single-flight loader for the locally bundled OpenCV.js (WASM) build.
 * Never imported on the server; the module is ~10 MB and is fetched only when a scan starts.
 */
import type * as cvNS from '@techstark/opencv-js';

export type CV = typeof cvNS;

type Candidate = Partial<CV> & { then?: unknown; onRuntimeInitialized?: () => void };

let loading: Promise<CV> | null = null;

function isReady(cv: Partial<CV>): boolean {
  return typeof cv.Mat === 'function';
}

/**
 * Wait for an emscripten OpenCV module to finish initialising and return it.
 *
 * The emscripten Module is a *thenable* (`Module.then` fires once the runtime is ready) — but
 * `await`-ing it, or resolving a promise with it, recurses forever because the value it passes to
 * the callback is the thenable itself. So we register a plain callback and strip `then` before
 * handing the module out.
 */
export async function initializeOpenCV(mod: unknown): Promise<CV> {
  const candidate = ((mod as { default?: unknown }).default ?? mod) as Candidate;
  if (!isReady(candidate)) {
    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        if (isReady(candidate)) {
          clearInterval(timer);
          resolve();
        }
      }, 50);
      const done = () => {
        clearInterval(timer);
        resolve();
      };
      if (typeof candidate.then === 'function') (candidate.then as (cb: () => void) => void)(done);
      else candidate.onRuntimeInitialized = done;
    });
  }
  if (typeof candidate.then === 'function') delete candidate.then;
  return candidate as CV;
}

export function loadOpenCV(): Promise<CV> {
  if (loading) return loading;
  loading = import('./opencv-module')
    .then((m) => initializeOpenCV(m.getOpenCVModule()))
    .catch((err: unknown) => {
      loading = null;
      throw err;
    });
  return loading;
}

/** Test hook — lets Node tests inject a module loaded outside the bundler's dynamic import. */
export function __setOpenCVForTests(cv: CV | null): void {
  loading = cv ? Promise.resolve(cv) : null;
}
