/**
 * TF.js backend selection (plan §12.3): WebGL first, transparent WASM fallback, CPU as last resort.
 * WASM binaries are served from /tfjs-wasm/ (copied at build time) — no CDN.
 */
import * as tf from '@tensorflow/tfjs';
import type { InferenceBackend } from '@authentic-edge/shared-types';

let ready: Promise<InferenceBackend> | null = null;

export function selectBackend(preferred?: InferenceBackend): Promise<InferenceBackend> {
  if (ready && !preferred) return ready;
  ready = (async () => {
    const order: InferenceBackend[] = preferred
      ? [preferred, 'webgl', 'wasm', 'cpu']
      : ['webgl', 'wasm', 'cpu'];
    for (const name of order) {
      try {
        if (name === 'wasm') {
          const wasm = await import('@tensorflow/tfjs-backend-wasm');
          wasm.setWasmPaths('/tfjs-wasm/');
        }
        if (name === 'webgpu') continue; // not bundled in v1
        if (await tf.setBackend(name)) {
          await tf.ready();
          return name;
        }
      } catch {
        // try the next backend
      }
    }
    await tf.setBackend('cpu');
    await tf.ready();
    return 'cpu';
  })();
  return ready;
}

export function currentBackend(): InferenceBackend {
  const b = tf.getBackend();
  return b === 'webgl' || b === 'wasm' || b === 'webgpu' ? b : 'cpu';
}
