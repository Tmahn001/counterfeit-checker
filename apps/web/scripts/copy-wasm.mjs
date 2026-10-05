// Copies the TF.js WASM backend binaries into public/ so they are served (and precached) locally —
// no CDN dependency, per the offline-first / strict-CSP requirements (plan §13).
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve('@tensorflow/tfjs-backend-wasm/dist/tf-backend-wasm.js'));
const out = new URL('../public/tfjs-wasm/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
let n = 0;
for (const f of readdirSync(dist)) {
  if (f.endsWith('.wasm')) {
    cpSync(join(dist, f), join(out, f));
    n++;
  }
}
if (!existsSync(join(out, 'tfjs-backend-wasm.wasm'))) throw new Error('tfjs wasm binaries not found');
console.log(`copied ${n} wasm binaries → public/tfjs-wasm/`);
