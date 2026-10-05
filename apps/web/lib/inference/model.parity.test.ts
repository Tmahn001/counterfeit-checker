// @vitest-environment node
/**
 * Numerical parity between the exported TF.js artifact and the Keras model that produced it.
 * The exporter writes selftest.json (seeded input → expected normalised embedding through the
 * float16-rounded weights). If the model has not been generated yet the test is skipped.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as tf from '@tensorflow/tfjs';
import { embed, euclidean } from './siamese';

const dir = path.resolve(__dirname, '../../public/models/v1');
const has = existsSync(path.join(dir, 'model.json')) && existsSync(path.join(dir, 'selftest.json'));

function fileHandler(): tf.io.IOHandler {
  return {
    load: () => {
      const manifest = JSON.parse(readFileSync(path.join(dir, 'model.json'), 'utf8')) as {
        modelTopology: object;
        weightsManifest: Array<{ paths: string[]; weights: tf.io.WeightsManifestEntry[] }>;
        userDefinedMetadata: Record<string, unknown>;
      };
      const buffers = manifest.weightsManifest.flatMap((g) =>
        g.paths.map((p) => readFileSync(path.join(dir, p))),
      );
      const total = buffers.reduce((n, b) => n + b.length, 0);
      const weightData = new Uint8Array(total);
      let off = 0;
      for (const b of buffers) {
        weightData.set(b, off);
        off += b.length;
      }
      return Promise.resolve({
        modelTopology: manifest.modelTopology,
        weightSpecs: manifest.weightsManifest.flatMap((g) => g.weights),
        weightData: weightData.buffer,
        userDefinedMetadata:
          manifest.userDefinedMetadata as tf.io.ModelArtifacts['userDefinedMetadata'],
      });
    },
  };
}

describe.skipIf(!has)('TF.js artifact parity', () => {
  it('loads and reproduces the Python embedding', async () => {
    await tf.setBackend('cpu');
    const model = await tf.loadLayersModel(fileHandler());
    const fx = JSON.parse(readFileSync(path.join(dir, 'selftest.json'), 'utf8')) as {
      inputSize: number;
      input: number[];
      embedding: number[];
    };
    const meta = model.getUserDefinedMetadata() as {
      modelVersion: string;
      decisionThreshold: number;
      orb: { n_keypoints: number };
    };
    expect(meta.orb.n_keypoints).toBe(500);
    expect(meta.decisionThreshold).toBeGreaterThan(0);
    const e = embed(model, Float32Array.from(fx.input), fx.inputSize);
    expect(e.length).toBe(fx.embedding.length);
    expect(euclidean(e, fx.embedding)).toBeLessThan(1e-3);
  });
});
