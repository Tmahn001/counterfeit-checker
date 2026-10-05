// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as tf from '@tensorflow/tfjs';
import { decide, embed, euclidean } from './siamese';

describe('euclidean', () => {
  it('computes distance', () => {
    expect(euclidean([0, 0], [3, 4])).toBe(5);
    expect(() => euclidean([1], [1, 2])).toThrow();
  });
});

describe('decide', () => {
  const p = { threshold: 0.5, cnn_weight: 0.7, inconclusive_band: 0.1, min_orb_matches: 8 };
  it('is authentic well below the threshold', () => {
    const d = decide(0.1, null, p);
    expect(d.verdict).toBe('authentic');
    expect(d.confidence).toBeCloseTo(0.8);
  });
  it('is counterfeit well above the threshold', () => {
    const d = decide(1.0, null, p);
    expect(d.verdict).toBe('counterfeit');
    expect(d.confidence).toBe(1);
  });
  it('is inconclusive near the threshold', () => {
    expect(decide(0.52, null, p).verdict).toBe('inconclusive');
    expect(decide(0.48, null, p).verdict).toBe('inconclusive');
  });
  it('fuses ORB evidence', () => {
    const strongOrb = { good: 120, ratio: 0.9 };
    const weakOrb = { good: 20, ratio: 0.05 };
    expect(decide(0.3, strongOrb, p).score).toBeGreaterThan(decide(0.3, null, p).score);
    expect(decide(0.3, weakOrb, p).score).toBeLessThan(decide(0.3, null, p).score);
    // Too few matches to be meaningful: dampened, never flipped.
    const few = decide(0.1, { good: 2, ratio: 0.01 }, p);
    expect(few.verdict).toBe('authentic');
    expect(few.score).toBeCloseTo(0.8 * 0.7);
  });
  it('falls back to a sane threshold when metadata is broken', () => {
    expect(decide(0.1, null, { ...p, threshold: 0 }).threshold).toBe(0.5);
  });
});

describe('embed', () => {
  it('returns a unit vector and leaks no tensors (tf.tidy)', async () => {
    await tf.setBackend('cpu');
    const model = tf.sequential({
      layers: [tf.layers.flatten({ inputShape: [8, 8, 1] }), tf.layers.dense({ units: 16 })],
    });
    const before = tf.memory().numTensors;
    const input = new Float32Array(64).fill(0.5);
    for (let i = 0; i < 20; i++) embed(model, input, 8);
    const e = embed(model, input, 8);
    expect(e.length).toBe(16);
    expect(euclidean(e, new Float32Array(16))).toBeCloseTo(1, 5);
    expect(tf.memory().numTensors).toBe(before);
  });
});
