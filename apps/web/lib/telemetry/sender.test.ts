import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSender, enqueue, flush, installOnlineFlush } from './queue';
import { buildTelemetryPayload } from './payload';
import { __resetDbForTests } from '../storage/idb';

const decision = {
  verdict: 'authentic' as const,
  confidence: 0.7,
  distance: 0.2,
  threshold: 0.5,
  score: 0.7,
  orb: null,
};
const payload = buildTelemetryPayload({
  productCategory: 'a',
  decision,
  modelVersion: '1.0.0',
  backend: 'cpu',
  inferenceMs: 5,
  geo: null,
});

describe('defaultSender', () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each([
    [202, true],
    [400, true], // permanently rejected → drop
    [429, false], // throttled → retry later
    [503, false],
  ])('maps HTTP %s to %s', async (status, expected) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })));
    expect(await defaultSender('http://api')(payload)).toBe(expected);
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe('http://api/api/v1/telemetry/');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual(payload);
  });
  it('returns false on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    expect(await defaultSender('http://api')(payload)).toBe(false);
  });
});

describe('installOnlineFlush', () => {
  beforeEach(() => {
    indexedDB = new IDBFactory();
    __resetDbForTests();
  });
  it('flushes queued events when the browser comes back online', async () => {
    await enqueue(payload);
    const send = vi.fn().mockResolvedValue(true);
    installOnlineFlush(send);
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(send).toHaveBeenCalled());
    expect(await flush(send)).toBe(0);
  });
});
