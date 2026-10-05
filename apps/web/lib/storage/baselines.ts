/**
 * OEM baseline signature cache. The bundle shipped with the app (`/baselines/v1/baselines.json`) is
 * loaded on first run; when online, the registry endpoint may point at a newer bundle.
 */
import type { BaselineSignature, BaselinesBundle } from '@authentic-edge/shared-types';
import { STORES, getSetting, idb, setSetting } from './idb';

const VERSION_KEY = 'baselines-version';

export async function loadBaselines(url: string): Promise<BaselinesBundle> {
  const cachedVersion = await getSetting<string>(VERSION_KEY);
  let cached: BaselineSignature[] = [];
  try {
    cached = await idb.getAll<BaselineSignature>(STORES.baselines);
  } catch {
    cached = [];
  }
  if (cached.length > 0 && cachedVersion) {
    return { version: cachedVersion, modelVersion: cachedVersion, baselines: cached };
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`baselines fetch failed: ${res.status}`);
  const bundle = (await res.json()) as BaselinesBundle;
  await storeBaselines(bundle);
  return bundle;
}

export async function storeBaselines(bundle: BaselinesBundle): Promise<void> {
  try {
    await idb.clear(STORES.baselines);
    for (const b of bundle.baselines) await idb.put(STORES.baselines, b);
    await setSetting(VERSION_KEY, bundle.version);
  } catch {
    /* storage unavailable: in-memory only */
  }
}

export async function getBaseline(productCategory: string): Promise<BaselineSignature | null> {
  try {
    return (await idb.get<BaselineSignature>(STORES.baselines, productCategory)) ?? null;
  } catch {
    return null;
  }
}
