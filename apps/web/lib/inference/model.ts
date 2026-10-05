/**
 * Model loading with IndexedDB persistence (plan §9.3–9.4).
 *
 * The TF.js artifact (model.json + float16 shards) is fetched once and saved through TF.js's
 * `indexeddb://` IO handler, which stores weights as ArrayBuffers — bypassing the Cache Storage
 * quota some mobile browsers enforce. Subsequent loads never touch the network. A version hash
 * (`modelVersion` + `weightsSha256` from userDefinedMetadata) triggers a refresh when a new model
 * is deployed.
 */
import * as tf from '@tensorflow/tfjs';
import type { ModelMetadata } from '@authentic-edge/shared-types';
import { DEFAULT_DECISION, DEFAULT_ORB, DEFAULT_PREPROCESS } from '../vision/params';
import { getSetting, setSetting } from '../storage/idb';

export const MODEL_STORE_KEY = 'indexeddb://authentic-edge-embedding';
const META_KEY = 'model-metadata';

export interface LoadedModel {
  readonly model: tf.LayersModel;
  readonly metadata: ModelMetadata;
  readonly source: 'indexeddb' | 'network';
}

export type ProgressFn = (fraction: number) => void;

function coerceMetadata(raw: unknown, fallbackVersion: string): ModelMetadata {
  const r = (raw ?? {}) as Partial<ModelMetadata>;
  return {
    modelVersion: r.modelVersion ?? fallbackVersion,
    inputSize: r.inputSize ?? DEFAULT_PREPROCESS.input_size,
    embeddingDim: r.embeddingDim ?? 128,
    margin: r.margin ?? 1.0,
    decisionThreshold: r.decisionThreshold ?? DEFAULT_DECISION.threshold,
    orb: { ...DEFAULT_ORB, ...(r.orb ?? {}) },
    preprocess: { ...DEFAULT_PREPROCESS, ...(r.preprocess ?? {}) },
    decision: {
      ...DEFAULT_DECISION,
      ...(r.decision ?? {}),
      threshold: r.decisionThreshold ?? DEFAULT_DECISION.threshold,
    },
    weightsSha256: r.weightsSha256,
  };
}

async function fetchManifestMetadata(url: string): Promise<ModelMetadata | null> {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return null;
    const json = (await res.json()) as { userDefinedMetadata?: unknown };
    return coerceMetadata(json.userDefinedMetadata, 'unknown');
  } catch {
    return null;
  }
}

/** Load the cached model if present; otherwise download, persist and return it. */
export async function loadEmbeddingModel(
  manifestUrl: string,
  onProgress?: ProgressFn,
  opts: { checkForUpdate?: boolean } = {},
): Promise<LoadedModel> {
  const cachedMeta = await getSetting<ModelMetadata>(META_KEY);
  let cached: tf.LayersModel | null = null;
  if (cachedMeta) {
    try {
      cached = await tf.loadLayersModel(MODEL_STORE_KEY);
    } catch {
      cached = null; // storage was cleared — fall through to re-download (plan §12.3)
    }
  }

  if (cached && cachedMeta) {
    if (opts.checkForUpdate && typeof navigator !== 'undefined' && navigator.onLine) {
      const remote = await fetchManifestMetadata(manifestUrl);
      const changed =
        remote &&
        (remote.modelVersion !== cachedMeta.modelVersion ||
          (remote.weightsSha256 && remote.weightsSha256 !== cachedMeta.weightsSha256));
      if (changed) {
        cached.dispose();
        return downloadAndPersist(manifestUrl, onProgress);
      }
    }
    return { model: cached, metadata: cachedMeta, source: 'indexeddb' };
  }
  return downloadAndPersist(manifestUrl, onProgress);
}

async function downloadAndPersist(
  manifestUrl: string,
  onProgress?: ProgressFn,
): Promise<LoadedModel> {
  const model = await tf.loadLayersModel(manifestUrl, { onProgress });
  const metadata = coerceMetadata(model.getUserDefinedMetadata(), 'unknown');
  try {
    await model.save(MODEL_STORE_KEY);
    await setSetting(META_KEY, metadata);
  } catch {
    // Private mode / quota exceeded: the model still works for this session.
  }
  return { model, metadata, source: 'network' };
}

export async function clearCachedModel(): Promise<void> {
  try {
    await tf.io.removeModel(MODEL_STORE_KEY);
  } catch {
    /* nothing cached */
  }
  await setSetting(META_KEY, null);
}
