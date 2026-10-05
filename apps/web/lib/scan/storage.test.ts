import { describe, expect, it } from 'vitest';
import { loadLastResult, saveLastResult } from './storage';
import type { ScanResult } from './machine';

const result: ScanResult = {
  decision: {
    verdict: 'authentic',
    confidence: 0.8,
    distance: 0.1,
    threshold: 0.5,
    score: 0.8,
    orb: null,
  },
  productCategory: 'x',
  modelVersion: '1.0.0',
  backend: 'webgl',
  orbCount: 1,
  timings: { preprocessMs: 1, orbMs: 1, inferMs: 1, totalMs: 3 },
};

describe('result handoff', () => {
  it('round-trips through sessionStorage and tolerates garbage', () => {
    expect(loadLastResult()).toBeNull();
    saveLastResult(result);
    expect(loadLastResult()).toEqual(result);
    sessionStorage.setItem('authentic-edge:last-result', '{not json');
    expect(loadLastResult()).toBeNull();
  });
});
