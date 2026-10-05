// @vitest-environment node
/**
 * Runs the real pipeline (OpenCV.js WASM + TF.js CPU) on synthetic frames against a baseline
 * derived from one of them, and checks the hard architectural constraint: no network I/O.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import * as tf from '@tensorflow/tfjs';
import type { BaselineSignature, ModelMetadata } from '@authentic-edge/shared-types';
import { __setOpenCVForTests, initializeOpenCV, loadOpenCV, type CV } from '../vision/opencv';
import { DEFAULT_DECISION, DEFAULT_ORB, DEFAULT_PREPROCESS } from '../vision/params';
import { extractOrb } from '../vision/orb';
import { matFromImageData, preprocess, roiCrop } from '../vision/preprocess';
import { embed } from '../inference/siamese';
import { PipelineError, runPipeline, type Engine } from './pipeline';
import type { ScanEvent } from './machine';

function frame(size = 256, seed = 1): ImageData {
  const data = new Uint8ClampedArray(size * size * 4);
  let s = seed;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const v = Math.max(
        0,
        Math.min(
          255,
          (Math.sin(x * 0.7) > 0 ? 200 : 60) -
            ((x >> 4) % 3 === 0 && (y >> 4) % 2 === 0 ? 40 : 0) +
            (s % 20),
        ),
      );
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  return { data, width: size, height: size, colorSpace: 'srgb' } as ImageData;
}

let cv: CV;
let engine: Engine;
let baseline: BaselineSignature;
const fetchSpy = vi.fn();

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  __setOpenCVForTests(await initializeOpenCV(require('@techstark/opencv-js')));
  cv = await loadOpenCV();
  await tf.setBackend('cpu');
  const model = tf.sequential({
    layers: [
      tf.layers.conv2d({ inputShape: [128, 128, 1], filters: 4, kernelSize: 3, padding: 'same' }),
      tf.layers.globalAveragePooling2d({}),
      tf.layers.dense({ units: 128 }),
    ],
  });
  const metadata: ModelMetadata = {
    modelVersion: '0.0.0-test',
    inputSize: 128,
    embeddingDim: 128,
    margin: 1,
    decisionThreshold: 0.5,
    orb: DEFAULT_ORB,
    preprocess: DEFAULT_PREPROCESS,
    decision: DEFAULT_DECISION,
  };
  engine = { cv, model, metadata };
  // Baseline = signature of the reference frame, exactly as BaselineSigner does in Python.
  const rgba = matFromImageData(cv, frame(256, 1));
  const gray = preprocess(cv, rgba);
  const feats = extractOrb(cv, gray);
  const { tensor } = roiCrop(cv, gray, feats.points);
  rgba.delete();
  gray.delete();
  baseline = {
    product_category: 'test_product',
    display_name: 'Test',
    embedding: Array.from(embed(model, tensor, 128)),
    orb_descriptors_b64: Buffer.from(feats.descriptors).toString('base64'),
    orb_keypoint_count: feats.count,
    image_count: 1,
  };
  vi.stubGlobal('fetch', fetchSpy);
}, 120_000);

afterAll(() => vi.unstubAllGlobals());

describe('runPipeline', () => {
  it('walks every machine state and matches the reference frame as authentic', async () => {
    const events: ScanEvent['type'][] = [];
    const result = await runPipeline({
      engine,
      frame: frame(256, 1),
      productCategory: 'test_product',
      baseline,
      dispatch: (e) => events.push(e.type),
    });
    expect(events).toEqual(['CAPTURED', 'PREPROCESSED', 'FEATURES_EXTRACTED', 'INFERRED']);
    expect(result.decision.verdict).toBe('authentic');
    expect(result.decision.distance).toBeLessThan(1e-3);
    expect(result.decision.orb?.ratio).toBe(1);
    expect(result.orbCount).toBeGreaterThan(20);
    expect(result.modelVersion).toBe('0.0.0-test');
    expect(result.timings.totalMs).toBeGreaterThan(0);
  });

  it('scores a different frame further away than the reference', async () => {
    const same = await runPipeline({
      engine,
      frame: frame(256, 1),
      productCategory: 'p',
      baseline,
      dispatch: () => undefined,
    });
    const other = await runPipeline({
      engine,
      frame: frame(256, 77),
      productCategory: 'p',
      baseline,
      dispatch: () => undefined,
    });
    expect(other.decision.distance).toBeGreaterThan(same.decision.distance);
    expect(other.decision.orb!.ratio).toBeLessThan(same.decision.orb!.ratio);
  });

  it('never touches the network (plan §2 hard constraint 1)', async () => {
    fetchSpy.mockClear();
    await runPipeline({
      engine,
      frame: frame(),
      productCategory: 'p',
      baseline,
      dispatch: () => undefined,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails with no_baseline when the product has no reference', async () => {
    await expect(
      runPipeline({
        engine,
        frame: frame(),
        productCategory: 'unknown',
        baseline: null,
        dispatch: () => undefined,
      }),
    ).rejects.toBeInstanceOf(PipelineError);
    await expect(
      runPipeline({
        engine,
        frame: frame(),
        productCategory: 'unknown',
        baseline: null,
        dispatch: () => undefined,
      }),
    ).rejects.toMatchObject({ code: 'no_baseline' });
  });

  it('leaks no tensors across 25 consecutive scans (tf.tidy)', async () => {
    const before = tf.memory().numTensors;
    for (let i = 0; i < 25; i++)
      await runPipeline({
        engine,
        frame: frame(256, i),
        productCategory: 'p',
        baseline,
        dispatch: () => undefined,
      });
    expect(tf.memory().numTensors).toBe(before);
  });
});
