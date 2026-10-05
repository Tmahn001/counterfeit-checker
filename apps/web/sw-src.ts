/// <reference lib="webworker" />
/**
 * Service worker (plan §9.4). Workbox injects the precache manifest of the static export at build.
 *  - App shell + engine (JS/CSS/WASM): precached, cache-first.
 *  - Model shards & baselines: runtime cache-first (versioned directories ⇒ immutable); the app
 *    additionally persists the model in IndexedDB.
 *  - Navigations to un-cached routes while offline fall back to /offline.html.
 *  - Background Sync replays queued telemetry POSTs; the SW never sees image data because no
 *    request in the authentication flow carries any.
 */
import {
  precacheAndRoute,
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
} from 'workbox-precaching';
import { registerRoute, NavigationRoute, setCatchHandler } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data = event.data as { type?: string } | undefined;
  if (data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Model artifacts and baselines: cache-first, immutable per version directory.
registerRoute(
  ({ url }) =>
    url.pathname.startsWith('/models/') ||
    url.pathname.startsWith('/baselines/') ||
    url.pathname.startsWith('/catalogue/'),
  new CacheFirst({
    cacheName: 'model-artifacts-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 40, purgeOnQuotaError: true }),
    ],
  }),
);

// Registry check: fresh when online, cached copy otherwise.
registerRoute(
  ({ url }) => url.pathname.endsWith('/api/v1/models/latest/'),
  new NetworkFirst({ cacheName: 'api-registry-v1', networkTimeoutSeconds: 4 }),
);

// App-shell navigation: serve the precached page; unknown routes → offline page.
const handler = createHandlerBoundToURL('/offline.html');
registerRoute(
  new NavigationRoute(
    async (params) => {
      const url = new URL(params.request.url);
      const candidates = [
        url.pathname,
        `${url.pathname.replace(/\/$/, '')}.html`,
        `${url.pathname.replace(/\/$/, '')}/index.html`,
      ];
      for (const c of candidates) {
        try {
          return await createHandlerBoundToURL(c)(params);
        } catch {
          /* not precached */
        }
      }
      return handler(params);
    },
    { denylist: [/^\/api\//, /^\/admin\//, /^\/django-static\//, /^\/media\//] },
  ),
);

setCatchHandler(async ({ request }) => {
  if (request.destination === 'document')
    return caches.match('/offline.html').then((r) => r ?? Response.error());
  return Response.error();
});

// Background Sync: the page enqueues telemetry in IndexedDB and registers this tag; when the
// browser fires it, tell every client to flush (the page owns the queue and the API base URL).
self.addEventListener('sync', (event: Event) => {
  const tag = (event as Event & { tag?: string }).tag;
  if (tag !== 'authentic-edge-telemetry') return;
  (event as Event & { waitUntil: (p: Promise<unknown>) => void }).waitUntil(
    self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
      for (const c of clients) c.postMessage({ type: 'FLUSH_TELEMETRY' });
    }),
  );
});
