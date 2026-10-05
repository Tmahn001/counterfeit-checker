/**
 * Privacy by construction (plan §9.6, §13).
 *
 * `TelemetryPayload` (shared-types) only has primitive fields. `AssertNoBinary<T>` turns any
 * attempt to add a binary/image/precise-GPS field into a *compile-time* error, and
 * `assertSafePayload` re-checks at runtime for values that arrive through `unknown`.
 */
import type { TelemetryPayload } from '@authentic-edge/shared-types';

type Forbidden =
  | ArrayBuffer
  | ArrayBufferView
  | Blob
  | ImageData
  | ImageBitmap
  | HTMLCanvasElement
  | HTMLImageElement
  | HTMLVideoElement
  | GeolocationCoordinates
  | GeolocationPosition;

/** Maps every forbidden-typed property to `never`; also forbids nested objects/arrays. */
export type AssertNoBinary<T> = {
  readonly [K in keyof T]: NonNullable<T[K]> extends Forbidden
    ? never
    : NonNullable<T[K]> extends string | number | boolean
      ? T[K]
      : never;
};

/** The only type `sendTelemetry` accepts. Structurally identical to TelemetryPayload; the
 *  `AssertNoBinary` mapping makes it a compile error to widen it with an image field. */
export type SafeTelemetryPayload = AssertNoBinary<TelemetryPayload> & TelemetryPayload;

const FORBIDDEN_KEY =
  /(image|photo|picture|frame|jpeg|jpg|png|bitmap|base64|blob|bytes|pixels|gps|latitude|longitude|imei|device_id|serial|mac|ip)/i;
const ALLOWED_KEYS = new Set<keyof TelemetryPayload>([
  'product_category',
  'verdict',
  'model_confidence_score',
  'distance',
  'state_code',
  'lga_code',
  'geo_lat_2dp',
  'geo_lng_2dp',
  'model_version',
  'backend',
  'inference_ms',
  'timestamp',
]);
export const MAX_STRING = 128;

export class UnsafeTelemetryError extends Error {}

/** Runtime guard mirroring the server-side serializer: allowlisted keys, primitives only. */
export function assertSafePayload(value: unknown): SafeTelemetryPayload {
  if (typeof value !== 'object' || value === null)
    throw new UnsafeTelemetryError('payload must be an object');
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!ALLOWED_KEYS.has(k as keyof TelemetryPayload) || FORBIDDEN_KEY.test(k)) {
      throw new UnsafeTelemetryError(`field not permitted in telemetry: ${k}`);
    }
    if (v === undefined || v === null) continue;
    if (typeof v === 'string') {
      if (v.length > MAX_STRING || /^\s*data:/i.test(v))
        throw new UnsafeTelemetryError(`unsafe string in ${k}`);
    } else if (typeof v !== 'number' && typeof v !== 'boolean') {
      throw new UnsafeTelemetryError(`non-primitive value in ${k}`);
    }
  }
  return value as SafeTelemetryPayload;
}
