import type { CoarseGeo, InferenceBackend, TelemetryPayload } from '@authentic-edge/shared-types';
import type { Decision } from '../inference/siamese';
import { assertSafePayload, type SafeTelemetryPayload } from './types';

export interface PayloadInput {
  readonly productCategory: string;
  readonly decision: Decision;
  readonly modelVersion: string;
  readonly backend: InferenceBackend;
  readonly inferenceMs: number;
  readonly geo: CoarseGeo | null;
  readonly now?: Date;
}

/** Build the anonymised payload. Accepts only scalars derived from the decision — never the frame. */
export function buildTelemetryPayload(input: PayloadInput): SafeTelemetryPayload {
  const payload: TelemetryPayload = {
    product_category: input.productCategory,
    verdict: input.decision.verdict,
    model_confidence_score: round(input.decision.confidence, 4),
    distance: round(input.decision.distance, 4),
    model_version: input.modelVersion,
    backend: input.backend,
    inference_ms: Math.max(0, Math.round(input.inferenceMs)),
    timestamp: (input.now ?? new Date()).toISOString(),
    ...(input.geo
      ? {
          state_code: input.geo.state_code,
          lga_code: input.geo.lga_code,
          geo_lat_2dp: input.geo.geo_lat_2dp,
          geo_lng_2dp: input.geo.geo_lng_2dp,
        }
      : {}),
  };
  return assertSafePayload(payload);
}

function round(v: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}
