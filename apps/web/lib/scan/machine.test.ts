import { describe, expect, it } from 'vitest';
import {
  initialScanState,
  isBusy,
  progressOf,
  scanReducer,
  type ScanResult,
  type ScanState,
} from './machine';

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
  orbCount: 200,
  timings: { preprocessMs: 1, orbMs: 2, inferMs: 3, totalMs: 6 },
};

function run(
  events: Parameters<typeof scanReducer>[1][],
  from: ScanState = initialScanState,
): ScanState {
  return events.reduce(scanReducer, from);
}

describe('scanReducer', () => {
  it('walks the happy path in order', () => {
    const states: ScanState['status'][] = [];
    let s: ScanState = initialScanState;
    for (const e of [
      { type: 'CAPTURE' } as const,
      { type: 'CAPTURED', at: 0 } as const,
      { type: 'PREPROCESSED', at: 1 } as const,
      { type: 'FEATURES_EXTRACTED', at: 2, orbCount: 10 } as const,
      { type: 'INFERRED', result } as const,
    ]) {
      s = scanReducer(s, e);
      states.push(s.status);
    }
    expect(states).toEqual([
      'capturing',
      'preprocessing',
      'extracting_features',
      'inferring',
      'result',
    ]);
  });

  it('ignores out-of-order events', () => {
    expect(run([{ type: 'PREPROCESSED', at: 1 }])).toEqual(initialScanState);
    expect(run([{ type: 'INFERRED', result }])).toEqual(initialScanState);
    const capturing = run([{ type: 'CAPTURE' }]);
    expect(scanReducer(capturing, { type: 'CAPTURE' })).toBe(capturing);
    expect(scanReducer(capturing, { type: 'FEATURES_EXTRACTED', at: 1, orbCount: 1 })).toBe(
      capturing,
    );
  });

  it('fails from any state and recovers via RESET / CAPTURE', () => {
    const mid = run([{ type: 'CAPTURE' }, { type: 'CAPTURED', at: 0 }]);
    const failed = scanReducer(mid, { type: 'FAIL', code: 'pipeline', message: 'boom' });
    expect(failed).toEqual({ status: 'error', code: 'pipeline', message: 'boom' });
    expect(scanReducer(failed, { type: 'RESET' })).toEqual(initialScanState);
    expect(scanReducer(failed, { type: 'CAPTURE' }).status).toBe('capturing');
  });

  it('allows a new capture from result', () => {
    const done = run([
      { type: 'CAPTURE' },
      { type: 'CAPTURED', at: 0 },
      { type: 'PREPROCESSED', at: 1 },
      { type: 'FEATURES_EXTRACTED', at: 2, orbCount: 5 },
      { type: 'INFERRED', result },
    ]);
    expect(done.status).toBe('result');
    expect(scanReducer(done, { type: 'CAPTURE' }).status).toBe('capturing');
  });

  it('reports busy and progress', () => {
    expect(isBusy(initialScanState)).toBe(false);
    expect(isBusy(run([{ type: 'CAPTURE' }]))).toBe(true);
    expect(progressOf(initialScanState)).toBe(0);
    expect(progressOf(run([{ type: 'CAPTURE' }]))).toBeGreaterThan(0);
    expect(progressOf({ status: 'result', result })).toBe(1);
    expect(progressOf({ status: 'error', code: 'unknown', message: '' })).toBe(0);
  });
});
