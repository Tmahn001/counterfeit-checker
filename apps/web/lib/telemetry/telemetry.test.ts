import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { assertSafePayload, UnsafeTelemetryError, type AssertNoBinary } from './types';
import { buildTelemetryPayload } from './payload';
import { coarsen, nearestState } from './geo';
import { enqueue, flush } from './queue';
import { __resetDbForTests } from '../storage/idb';
import type { TelemetryPayload } from '@authentic-edge/shared-types';

const decision = {
  verdict: 'counterfeit' as const,
  confidence: 0.912345,
  distance: 1.23456,
  threshold: 0.5,
  score: -0.91,
  orb: null,
};

describe('type-level privacy invariant', () => {
  it('maps forbidden fields to never (compile-time check)', () => {
    type Bad = TelemetryPayload & { image: Blob; coords: GeolocationCoordinates };
    type Checked = AssertNoBinary<Bad>;
    const imageIsNever: Checked['image'] extends never ? true : false = true;
    const coordsIsNever: Checked['coords'] extends never ? true : false = true;
    expect(imageIsNever && coordsIsNever).toBe(true);
  });
});

describe('assertSafePayload', () => {
  const base = {
    product_category: 'p',
    verdict: 'authentic',
    model_confidence_score: 0.5,
    model_version: '1.0.0',
    timestamp: 't',
  };
  it('accepts a clean payload', () => {
    expect(assertSafePayload(base)).toEqual(base);
  });
  it.each([
    [{ ...base, image: 'abc' }],
    [{ ...base, photo_b64: 'abc' }],
    [{ ...base, latitude: 6.5 }],
    [{ ...base, extra: 1 }],
    [{ ...base, product_category: 'data:image/png;base64,xx' }],
    [{ ...base, product_category: 'x'.repeat(200) }],
    [{ ...base, distance: { nested: true } }],
    [{ ...base, distance: new Uint8Array(4) }],
  ])('rejects %j', (bad) => {
    expect(() => assertSafePayload(bad)).toThrow(UnsafeTelemetryError);
  });
});

describe('buildTelemetryPayload', () => {
  it('produces the allowlisted shape with rounded scalars', () => {
    const p = buildTelemetryPayload({
      productCategory: 'antimalarial',
      decision,
      modelVersion: '1.0.0',
      backend: 'wasm',
      inferenceMs: 312.6,
      geo: coarsen(6.601234, 3.351234),
      now: new Date('2026-09-18T10:00:00Z'),
    });
    expect(p).toEqual({
      product_category: 'antimalarial',
      verdict: 'counterfeit',
      model_confidence_score: 0.9123,
      distance: 1.2346,
      model_version: '1.0.0',
      backend: 'wasm',
      inference_ms: 313,
      timestamp: '2026-09-18T10:00:00.000Z',
      state_code: 'LA',
      lga_code: 'LA-66_34',
      geo_lat_2dp: 6.6,
      geo_lng_2dp: 3.35,
    });
  });
  it('omits geo when unavailable', () => {
    const p = buildTelemetryPayload({
      productCategory: 'a',
      decision,
      modelVersion: '1.0.0',
      backend: 'webgl',
      inferenceMs: 1,
      geo: null,
    });
    expect(p).not.toHaveProperty('geo_lat_2dp');
  });
});

describe('geo coarsening', () => {
  it('maps to nearest state and 2dp', () => {
    expect(nearestState(12.0, 8.5)).toBe('KN');
    expect(nearestState(9.06, 7.49)).toBe('FC');
    const g = coarsen(4.81234, 7.0399);
    expect(g.state_code).toBe('RV');
    expect(g.geo_lat_2dp).toBe(4.81);
    expect(g.geo_lng_2dp).toBe(7.04);
  });
});

describe('queue', () => {
  beforeEach(() => {
    indexedDB = new IDBFactory();
    __resetDbForTests();
  });
  const payload = buildTelemetryPayload({
    productCategory: 'a',
    decision,
    modelVersion: '1.0.0',
    backend: 'cpu',
    inferenceMs: 1,
    geo: null,
  });

  it('persists and flushes when the sender succeeds', async () => {
    await enqueue(payload);
    await enqueue(payload);
    const send = vi.fn().mockResolvedValue(true);
    expect(await flush(send)).toBe(2);
    expect(send).toHaveBeenCalledTimes(2);
    expect(await flush(send)).toBe(0);
  });

  it('keeps events when offline and stops after the first failure', async () => {
    await enqueue(payload);
    await enqueue(payload);
    const send = vi.fn().mockResolvedValue(false);
    expect(await flush(send)).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await flush(vi.fn().mockResolvedValue(true))).toBe(2);
  });

  it('refuses unsafe payloads at enqueue time', async () => {
    await expect(enqueue({ ...payload, image: 'x' } as unknown as typeof payload)).rejects.toThrow(
      UnsafeTelemetryError,
    );
  });
});
