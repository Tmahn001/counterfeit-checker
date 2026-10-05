// @vitest-environment jsdom
// (TF.js registers its indexeddb:// IO handler only when it detects a browser environment.)
/** Model cache behaviour (plan §9.4, §12.3): download → persist in IndexedDB → serve from cache →
 *  refresh on version change → re-download after storage loss. Uses fake-indexeddb + a fetch stub. */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as tf from '@tensorflow/tfjs';
import { __resetDbForTests } from '../storage/idb';
import { clearCachedModel, loadEmbeddingModel } from './model';

const dir = path.resolve(__dirname, '../../public/models/v1');
let version = '1.0.0';
let sha = 'aaa';
const fetchMock = vi.fn((input: RequestInfo | URL): Promise<Response> => {
  const url = String(input);
  if (url.endsWith('model.json')) {
    const m = JSON.parse(readFileSync(path.join(dir, 'model.json'), 'utf8')) as {
      userDefinedMetadata: Record<string, unknown>;
    };
    m.userDefinedMetadata = { ...m.userDefinedMetadata, modelVersion: version, weightsSha256: sha };
    return Promise.resolve(
      new Response(JSON.stringify(m), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }
  const shard = url.split('/').pop() ?? '';
  return Promise.resolve(new Response(readFileSync(path.join(dir, shard)), { status: 200 }));
});

describe('loadEmbeddingModel', () => {
  beforeEach(async () => {
    indexedDB = new IDBFactory();
    __resetDbForTests();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('navigator', { onLine: true });
    fetchMock.mockClear();
    await tf.setBackend('cpu');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('downloads once, then serves from IndexedDB without fetching', async () => {
    const first = await loadEmbeddingModel('/models/v1/model.json');
    expect(first.source).toBe('network');
    expect(first.metadata.modelVersion).toBe('1.0.0');
    expect(first.metadata.orb.n_keypoints).toBe(500);
    const fetches = fetchMock.mock.calls.length;
    expect(fetches).toBeGreaterThan(0);
    const second = await loadEmbeddingModel('/models/v1/model.json');
    expect(second.source).toBe('indexeddb');
    expect(fetchMock.mock.calls.length).toBe(fetches);
    expect(second.model.inputs[0]?.shape).toEqual([null, 128, 128, 1]);
  });

  it('refreshes when the deployed version changes and the device is online', async () => {
    await loadEmbeddingModel('/models/v1/model.json');
    version = '1.1.0';
    sha = 'bbb';
    const updated = await loadEmbeddingModel('/models/v1/model.json', undefined, {
      checkForUpdate: true,
    });
    expect(updated.source).toBe('network');
    expect(updated.metadata.modelVersion).toBe('1.1.0');
    const again = await loadEmbeddingModel('/models/v1/model.json', undefined, {
      checkForUpdate: true,
    });
    expect(again.source).toBe('indexeddb');
  });

  it('re-downloads with progress after the cache is cleared (storage loss)', async () => {
    await loadEmbeddingModel('/models/v1/model.json');
    await clearCachedModel();
    const progress: number[] = [];
    const reloaded = await loadEmbeddingModel('/models/v1/model.json', (p) => progress.push(p));
    expect(reloaded.source).toBe('network');
    expect(progress.length).toBeGreaterThan(0);
  });
});
