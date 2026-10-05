/**
 * Outbound telemetry queue (plan §9.6): IndexedDB-backed, flushed when connectivity returns via the
 * Background Sync API where available, or an online-event/interval retry otherwise. Never blocks
 * the authentication flow — `enqueue` resolves as soon as the record is persisted.
 */
import { STORES, idb } from '../storage/idb';
import { assertSafePayload, type SafeTelemetryPayload } from './types';

export const SYNC_TAG = 'authentic-edge-telemetry';
const MAX_ATTEMPTS = 8;

interface QueuedEvent {
  readonly payload: SafeTelemetryPayload;
  readonly attempts: number;
}

export async function enqueue(payload: SafeTelemetryPayload): Promise<void> {
  assertSafePayload(payload);
  try {
    await idb.add(STORES.telemetry, { payload, attempts: 0 } satisfies QueuedEvent);
  } catch {
    return; // no storage — drop silently; telemetry is best-effort
  }
  await requestBackgroundSync();
}

async function requestBackgroundSync(): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const sync = (reg as unknown as { sync?: { register: (tag: string) => Promise<void> } }).sync;
    if (sync) await sync.register(SYNC_TAG);
  } catch {
    /* Background Sync unsupported: flushOnline() handles it */
  }
}

export type Sender = (payload: SafeTelemetryPayload) => Promise<boolean>;

export function defaultSender(apiBaseUrl: string): Sender {
  return async (payload) => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/telemetry/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      });
      // 4xx = permanently rejected (drop); 5xx/network = retry later.
      return res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429);
    } catch {
      return false;
    }
  };
}

/** Drain the queue. Returns the number of events successfully sent. Safe to call repeatedly. */
export async function flush(send: Sender): Promise<number> {
  let keys: IDBValidKey[];
  try {
    keys = await idb.getAllKeys(STORES.telemetry);
  } catch {
    return 0;
  }
  let sent = 0;
  for (const key of keys) {
    const item = await idb.get<QueuedEvent>(STORES.telemetry, key);
    if (!item) continue;
    const ok = await send(item.payload);
    if (ok) {
      await idb.delete(STORES.telemetry, key);
      sent++;
    } else if (item.attempts + 1 >= MAX_ATTEMPTS) {
      await idb.delete(STORES.telemetry, key);
    } else {
      await idb.put(STORES.telemetry, { ...item, attempts: item.attempts + 1 }, key);
      break; // still offline — stop hammering
    }
  }
  return sent;
}

let installed = false;
/** Install online/visibility listeners that flush the queue (fallback when Background Sync is absent). */
export function installOnlineFlush(send: Sender): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const run = () => {
    if (navigator.onLine) void flush(send);
  };
  window.addEventListener('online', run);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') run();
  });
  setTimeout(run, 3000);
}
