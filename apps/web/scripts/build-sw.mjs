// Compiles sw-src.ts with esbuild, then injects the precache manifest of the static export with Workbox.
import { build } from 'esbuild';
import { injectManifest } from 'workbox-build';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url).pathname;
const tmp = `${root}out/sw.tmp.js`;

await build({
  entryPoints: [`${root}sw-src.ts`],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  outfile: tmp,
  define: { 'process.env.NODE_ENV': '"production"' },
});

const { count, size, warnings } = await injectManifest({
  swSrc: tmp,
  swDest: `${root}out/sw.js`,
  globDirectory: `${root}out`,
  // App shell + engine (JS/CSS/WASM) + fonts. Model shards and baselines are handled at runtime
  // (cache-first with an IndexedDB copy) so a model update never requires an app release.
  globPatterns: ['**/*.{html,js,css,wasm,webmanifest,json,png,svg,ico,woff2}'],
  globIgnores: ['sw.tmp.js', 'sw.js', 'models/**', 'baselines/**', '404.html'],
  maximumFileSizeToCacheInBytes: 12 * 1024 * 1024, // OpenCV.js chunk
  dontCacheBustURLsMatching: /\/_next\/static\//,
});
rmSync(tmp, { force: true });
for (const w of warnings) console.warn('[workbox]', w);
console.log(`sw.js: precaching ${count} files, ${(size / 1024 / 1024).toFixed(2)} MB`);

// Budget gate (plan §14): total cached payload must stay < 15 MB.
const budget = 15 * 1024 * 1024;
const modelJson = JSON.parse(readFileSync(`${root}public/models/v1/model.json`, 'utf8'));
const shards = modelJson.weightsManifest.flatMap((g) => g.paths);
let modelBytes = 0;
for (const s of shards) modelBytes += readFileSync(`${root}public/models/v1/${s}`).length;
const total = size + modelBytes;
console.log(`cached payload estimate: ${(total / 1024 / 1024).toFixed(2)} MB (budget 15 MB)`);
if (total > budget) {
  console.error('cached payload exceeds the 15 MB budget');
  process.exit(1);
}
writeFileSync(`${root}out/precache-report.json`, JSON.stringify({ count, size, modelBytes, total }));
