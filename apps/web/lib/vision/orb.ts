/**
 * ORB feature extraction + descriptor matching (plan §9.2, §8.3).
 *
 * Extraction uses OpenCV.js's ORB (rBRIEF's 256 binary tests are a static table inside the WASM
 * module — computed once at load, never per scan). Matching is implemented in TypeScript:
 * brute-force Hamming with Lowe's ratio test and a hard distance threshold. Pure TS keeps the
 * matcher unit-testable without WASM and avoids per-scan Mat allocations.
 */
import type { OrbParams } from '@authentic-edge/shared-types';
import type { CV } from './opencv';
import type { Mat } from '@techstark/opencv-js';
import { DEFAULT_ORB } from './params';

export interface OrbFeatures {
  /** Keypoint coordinates in image space. */
  readonly points: ReadonlyArray<readonly [number, number]>;
  /** Row-major uint8 descriptors, 32 bytes per keypoint. */
  readonly descriptors: Uint8Array;
  readonly count: number;
}

export const DESCRIPTOR_BYTES = 32;

export function extractOrb(cv: CV, gray: Mat, p: OrbParams = DEFAULT_ORB): OrbFeatures {
  // The emscripten bindings cannot marshal the ORB::ScoreType enum, so the 9-arg overload is
  // unavailable; use the 6-arg overload (Harris score is OpenCV's default, matching the Python twin)
  // and set the remaining parameters through the bound setters.
  const orb = new cv.ORB(p.n_keypoints, p.scale_factor, p.n_levels, p.edge_threshold, 0, 2);
  (orb as unknown as { setFastThreshold: (v: number) => void }).setFastThreshold(p.fast_threshold);
  (orb as unknown as { setPatchSize: (v: number) => void }).setPatchSize(p.patch_size);
  const keypoints = new cv.KeyPointVector();
  const descriptors = new cv.Mat();
  const mask = new cv.Mat();
  try {
    orb.detectAndCompute(gray, mask, keypoints, descriptors);
    const count = keypoints.size();
    const points: Array<readonly [number, number]> = [];
    for (let i = 0; i < count; i++) {
      const kp = keypoints.get(i) as { pt: { x: number; y: number } };
      points.push([kp.pt.x, kp.pt.y]);
    }
    const desc = new Uint8Array(count * DESCRIPTOR_BYTES);
    if (count > 0) desc.set(descriptors.data.subarray(0, count * DESCRIPTOR_BYTES));
    return { points, descriptors: desc, count };
  } finally {
    orb.delete();
    keypoints.delete();
    descriptors.delete();
    mask.delete();
  }
}

const POPCOUNT = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  let c = 0;
  let v = i;
  while (v) {
    c += v & 1;
    v >>= 1;
  }
  POPCOUNT[i] = c;
}

export function hamming(a: Uint8Array, ai: number, b: Uint8Array, bi: number): number {
  let d = 0;
  for (let k = 0; k < DESCRIPTOR_BYTES; k++) {
    d += POPCOUNT[(a[ai + k] ?? 0) ^ (b[bi + k] ?? 0)] ?? 0;
  }
  return d;
}

export interface MatchResult {
  readonly good: number;
  /** good / min(nQuery, nBaseline) */
  readonly ratio: number;
}

/** Brute-force Hamming kNN(k=2) + Lowe ratio + hard threshold, identical to the Python twin. */
export function matchDescriptors(
  query: Uint8Array,
  baseline: Uint8Array,
  p: OrbParams = DEFAULT_ORB,
): MatchResult {
  const nq = Math.floor(query.length / DESCRIPTOR_BYTES);
  const nb = Math.floor(baseline.length / DESCRIPTOR_BYTES);
  if (nq < 2 || nb < 2) return { good: 0, ratio: 0 };
  let good = 0;
  for (let i = 0; i < nq; i++) {
    let best = Infinity;
    let second = Infinity;
    const qi = i * DESCRIPTOR_BYTES;
    for (let j = 0; j < nb; j++) {
      const d = hamming(query, qi, baseline, j * DESCRIPTOR_BYTES);
      if (d < best) {
        second = best;
        best = d;
      } else if (d < second) {
        second = d;
      }
    }
    if (best < p.lowe_ratio * second && best <= p.hamming_threshold) good++;
  }
  return { good, ratio: good / Math.min(nq, nb) };
}

export function descriptorsFromBase64(b64: string): Uint8Array {
  if (!b64) return new Uint8Array(0);
  const bin =
    typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
