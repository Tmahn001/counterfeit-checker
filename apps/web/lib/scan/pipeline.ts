/**
 * The authentication pipeline (Table 3.2 steps 2–6). Pure function of a captured frame; it performs
 * NO network I/O — any `fetch()` here is a bug (plan §2, hard constraint 1). The engine (OpenCV.js,
 * TF.js model, baseline) is prepared beforehand by `prepareEngine`, which is the only place that
 * may touch the network (first load / model update).
 */
import type { BaselineSignature, ModelMetadata } from '@authentic-edge/shared-types';
import type { LayersModel } from '@tensorflow/tfjs';
import { loadOpenCV, type CV } from '../vision/opencv';
import {
  extractOrb,
  descriptorsFromBase64,
  matchDescriptors,
  type OrbFeatures,
} from '../vision/orb';
import { matFromImageData, preprocess, roiCrop } from '../vision/preprocess';
import { currentBackend, selectBackend } from '../inference/backend';
import { loadEmbeddingModel, type ProgressFn } from '../inference/model';
import { decide, embed, euclidean } from '../inference/siamese';
import { getBaseline, loadBaselines } from '../storage/baselines';
import type { ScanEvent, ScanResult } from './machine';

export interface Engine {
  readonly cv: CV;
  readonly model: LayersModel;
  readonly metadata: ModelMetadata;
}

export interface PrepareOptions {
  readonly modelManifestUrl: string;
  readonly baselinesUrl: string;
  readonly onModelProgress?: ProgressFn;
  readonly onStage?: (stage: 'opencv' | 'backend' | 'model' | 'baselines') => void;
}

let enginePromise: Promise<Engine> | null = null;

/** Load OpenCV.js, pick a TF.js backend, load (or download+cache) the model and baselines. */
export function prepareEngine(opts: PrepareOptions): Promise<Engine> {
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    opts.onStage?.('opencv');
    const cvPromise = loadOpenCV();
    opts.onStage?.('backend');
    await selectBackend();
    opts.onStage?.('model');
    const loaded = await loadEmbeddingModel(opts.modelManifestUrl, opts.onModelProgress, {
      checkForUpdate: true,
    });
    opts.onStage?.('baselines');
    await loadBaselines(opts.baselinesUrl).catch(() => undefined);
    const cv = await cvPromise;
    // Warm-up: the first predict compiles WebGL shaders; do it now, not on the user's first scan.
    const size = loaded.metadata.inputSize;
    embed(loaded.model, new Float32Array(size * size), size);
    return { cv, model: loaded.model, metadata: loaded.metadata };
  })().catch((err: unknown) => {
    enginePromise = null;
    throw err;
  });
  return enginePromise;
}

/** Test hook. */
export function __resetEngineForTests(): void {
  enginePromise = null;
}

export interface RunOptions {
  readonly engine: Engine;
  readonly frame: ImageData;
  readonly productCategory: string;
  readonly baseline?: BaselineSignature | null;
  readonly dispatch: (e: ScanEvent) => void;
  readonly now?: () => number;
}

/** Steps 2–6: preprocess → ORB → ROI → embed → D_W → decision. Dispatches machine events as it goes. */
export async function runPipeline(opts: RunOptions): Promise<ScanResult> {
  const now = opts.now ?? (() => performance.now());
  const { cv, model, metadata } = opts.engine;
  const baseline =
    opts.baseline === undefined ? await getBaseline(opts.productCategory) : opts.baseline;
  if (!baseline) throw new PipelineError('no_baseline', `no baseline for ${opts.productCategory}`);

  const t0 = now();
  opts.dispatch({ type: 'CAPTURED', at: t0 });
  const rgba = matFromImageData(cv, opts.frame);
  let gray;
  let features: OrbFeatures;
  let tensor: Float32Array;
  try {
    gray = preprocess(cv, rgba, metadata.preprocess);
  } finally {
    rgba.delete();
  }
  const t1 = now();
  opts.dispatch({ type: 'PREPROCESSED', at: t1 });
  try {
    features = extractOrb(cv, gray, metadata.orb);
    tensor = roiCrop(cv, gray, features.points, metadata.preprocess).tensor;
  } finally {
    gray.delete();
  }
  const t2 = now();
  opts.dispatch({ type: 'FEATURES_EXTRACTED', at: t2, orbCount: features.count });

  const query = embed(model, tensor, metadata.inputSize);
  const distance = euclidean(query, baseline.embedding);
  const baselineDesc = descriptorsFromBase64(baseline.orb_descriptors_b64);
  const orbMatch =
    baselineDesc.length > 0
      ? matchDescriptors(features.descriptors, baselineDesc, metadata.orb)
      : null;
  const decision = decide(distance, orbMatch, metadata.decision);
  const t3 = now();

  const result: ScanResult = {
    decision,
    productCategory: opts.productCategory,
    modelVersion: metadata.modelVersion,
    backend: currentBackend(),
    orbCount: features.count,
    timings: { preprocessMs: t1 - t0, orbMs: t2 - t1, inferMs: t3 - t2, totalMs: t3 - t0 },
  };
  opts.dispatch({ type: 'INFERRED', result });
  return result;
}

export class PipelineError extends Error {
  constructor(
    public readonly code: 'no_baseline' | 'pipeline',
    message: string,
  ) {
    super(message);
  }
}
