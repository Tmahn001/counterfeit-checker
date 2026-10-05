/**
 * Scan-flow state machine (plan §12.2): an explicit reducer so the UI can say honestly what is
 * happening and every transition is unit-testable.
 *
 *   idle → capturing → preprocessing → extracting_features → inferring → result
 *   any step ──error──▶ error ──retry──▶ idle
 */
import type { Decision } from '../inference/siamese';
import type { InferenceBackend } from '@authentic-edge/shared-types';

export type ScanState =
  | { readonly status: 'idle' }
  | { readonly status: 'capturing' }
  | { readonly status: 'preprocessing'; readonly startedAt: number }
  | { readonly status: 'extracting_features'; readonly startedAt: number }
  | { readonly status: 'inferring'; readonly startedAt: number; readonly orbCount: number }
  | { readonly status: 'result'; readonly result: ScanResult }
  | { readonly status: 'error'; readonly code: ScanErrorCode; readonly message: string };

export type ScanErrorCode =
  | 'camera_denied'
  | 'camera_unavailable'
  | 'camera_insecure'
  | 'model_load'
  | 'no_baseline'
  | 'pipeline'
  | 'unknown';

export interface ScanResult {
  readonly decision: Decision;
  readonly productCategory: string;
  readonly modelVersion: string;
  readonly backend: InferenceBackend;
  readonly orbCount: number;
  readonly timings: {
    readonly preprocessMs: number;
    readonly orbMs: number;
    readonly inferMs: number;
    readonly totalMs: number;
  };
}

export type ScanEvent =
  | { readonly type: 'CAPTURE' }
  | { readonly type: 'CAPTURED'; readonly at: number }
  | { readonly type: 'PREPROCESSED'; readonly at: number }
  | { readonly type: 'FEATURES_EXTRACTED'; readonly at: number; readonly orbCount: number }
  | { readonly type: 'INFERRED'; readonly result: ScanResult }
  | { readonly type: 'FAIL'; readonly code: ScanErrorCode; readonly message: string }
  | { readonly type: 'RESET' };

export const initialScanState: ScanState = { status: 'idle' };

export const SCAN_STATUSES = [
  'idle',
  'capturing',
  'preprocessing',
  'extracting_features',
  'inferring',
  'result',
  'error',
] as const;

export function scanReducer(state: ScanState, event: ScanEvent): ScanState {
  switch (event.type) {
    case 'RESET':
      return initialScanState;
    case 'FAIL':
      return { status: 'error', code: event.code, message: event.message };
    case 'CAPTURE':
      return state.status === 'idle' || state.status === 'result' || state.status === 'error'
        ? { status: 'capturing' }
        : state;
    case 'CAPTURED':
      return state.status === 'capturing'
        ? { status: 'preprocessing', startedAt: event.at }
        : state;
    case 'PREPROCESSED':
      return state.status === 'preprocessing'
        ? { status: 'extracting_features', startedAt: event.at }
        : state;
    case 'FEATURES_EXTRACTED':
      return state.status === 'extracting_features'
        ? { status: 'inferring', startedAt: event.at, orbCount: event.orbCount }
        : state;
    case 'INFERRED':
      return state.status === 'inferring' ? { status: 'result', result: event.result } : state;
    default:
      return state;
  }
}

export function isBusy(state: ScanState): boolean {
  return state.status !== 'idle' && state.status !== 'result' && state.status !== 'error';
}

/** Ordered progress (0..1) for the progress bar. */
export function progressOf(state: ScanState): number {
  const idx = SCAN_STATUSES.indexOf(state.status);
  if (state.status === 'result') return 1;
  if (state.status === 'error' || idx < 0) return 0;
  return idx / (SCAN_STATUSES.length - 2);
}
