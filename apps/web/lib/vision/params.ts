/**
 * Client-side defaults for the vision pipeline. These mirror
 * `ml/src/authentic_edge_ml/params.py` and are overridden at runtime by the values embedded in
 * the deployed `model.json` (`userDefinedMetadata`), so the app always runs the parameters the
 * model was trained/validated with (plan §21.2 — single source of truth).
 */
import type { DecisionParams, OrbParams, PreprocessParams } from '@authentic-edge/shared-types';

export const DEFAULT_ORB: OrbParams = {
  n_keypoints: 500, // cap keeps ORB ≤ ~15 ms on mid-tier devices while retaining enough microprint detail
  fast_threshold: 20, // FAST ε: below this, sensor noise on matte substrate floods the detector
  scale_factor: 1.2,
  n_levels: 8,
  edge_threshold: 31,
  patch_size: 31,
  hamming_threshold: 64, // 25% of the 256-bit rBRIEF descriptor
  lowe_ratio: 0.75,
};

export const DEFAULT_PREPROCESS: PreprocessParams = {
  clahe_clip_limit: 2.0,
  clahe_tile_grid: 8,
  denoise_method: 'bilateral', // the bundled OpenCV.js lacks `photo`; Python twin uses the same method (ADR-0004)
  bilateral_d: 5,
  bilateral_sigma_color: 25,
  bilateral_sigma_space: 5,
  nlm_h: 10,
  nlm_template_window: 7,
  nlm_search_window: 21,
  roi_fraction: 0.75,
  input_size: 128,
};

export const DEFAULT_DECISION: DecisionParams = {
  threshold: 0.5, // m/2 until the trained model's tuned threshold is read from model.json
  cnn_weight: 0.7,
  inconclusive_band: 0.1,
  min_orb_matches: 8,
};
