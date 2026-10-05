/**
 * Siamese forward pass + decision (plan §9.3, ADR-0003).
 *
 * D_W = ‖ norm(f(x_query)) − e_baseline ‖₂, where e_baseline is the OEM reference embedding
 * (already normalised) shipped in baselines.json. A distance below the tuned threshold means the
 * query matches the reference. The ORB good-match ratio is fused in as a secondary signal.
 *
 * Every tensor op is wrapped in `tf.tidy()` — mandatory for a continuous camera flow on 2 GB devices.
 */
import * as tf from '@tensorflow/tfjs';
import type { DecisionParams, Verdict } from '@authentic-edge/shared-types';
import type { MatchResult } from '../vision/orb';
import { DEFAULT_DECISION } from '../vision/params';

/** Run the embedding branch on a preprocessed [0,1] grayscale crop. Returns a normalised vector. */
export function embed(model: tf.LayersModel, input: Float32Array, inputSize: number): Float32Array {
  return tf.tidy(() => {
    const x = tf.tensor4d(input, [1, inputSize, inputSize, 1]);
    const e = model.predict(x) as tf.Tensor;
    const normed = tf.div(e, tf.maximum(tf.norm(e, 'euclidean', 1, true), 1e-12));
    return normed.dataSync() as Float32Array;
  });
}

export function euclidean(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length)
    throw new Error(`embedding length mismatch: ${a.length} vs ${b.length}`);
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    s += d * d;
  }
  return Math.sqrt(s);
}

export interface Decision {
  readonly verdict: Verdict;
  /** 0..1 */
  readonly confidence: number;
  readonly distance: number;
  readonly threshold: number;
  /** Signed fused score: >0 authentic, <0 counterfeit. */
  readonly score: number;
  readonly orb: MatchResult | null;
}

/**
 * Fuse the CNN distance with the ORB match ratio.
 *  cnnScore = clamp((t − d) / t, −1, 1)      (+1 = identical to reference, −1 = ≥ 2t away)
 *  orbScore = clamp(2·ratio − 1, −1, 1)       (only if enough matches to be meaningful)
 *  score    = w·cnnScore + (1−w)·orbScore     (w = cnn_weight; ORB omitted ⇒ w = 1)
 * Verdict: |score| ≤ inconclusive_band ⇒ inconclusive; sign otherwise. Confidence = min(1, |score|).
 */
export function decide(
  distance: number,
  orb: MatchResult | null,
  p: DecisionParams = DEFAULT_DECISION,
): Decision {
  const t = p.threshold > 0 ? p.threshold : DEFAULT_DECISION.threshold;
  const cnnScore = clamp((t - distance) / t, -1, 1);
  let score = cnnScore;
  if (orb && orb.good >= p.min_orb_matches) {
    const orbScore = clamp(2 * orb.ratio - 1, -1, 1);
    score = p.cnn_weight * cnnScore + (1 - p.cnn_weight) * orbScore;
  } else if (orb && orb.good < p.min_orb_matches && cnnScore > 0) {
    // CNN says "match" but there are almost no feature correspondences: dampen, don't flip.
    score = cnnScore * p.cnn_weight;
  }
  const verdict: Verdict =
    Math.abs(score) <= p.inconclusive_band
      ? 'inconclusive'
      : score > 0
        ? 'authentic'
        : 'counterfeit';
  return { verdict, confidence: Math.min(1, Math.abs(score)), distance, threshold: t, score, orb };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
