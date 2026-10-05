/** Messages between the UI thread and the engine worker. No image ever leaves the worker except as
 *  the scalar ScanResult; frames are transferred in, never copied out. */
import type { ScanEvent, ScanResult } from './machine';

export type EngineStage = 'opencv' | 'backend' | 'model' | 'baselines';

export interface FramePayload {
  readonly data: ArrayBuffer; // RGBA bytes (transferred)
  readonly width: number;
  readonly height: number;
}

export type ToWorker =
  | { readonly type: 'prepare'; readonly modelManifestUrl: string; readonly baselinesUrl: string }
  | {
      readonly type: 'scan';
      readonly id: number;
      readonly frame: FramePayload;
      readonly productCategory: string;
    };

export type FromWorker =
  | { readonly type: 'stage'; readonly stage: EngineStage }
  | { readonly type: 'progress'; readonly fraction: number }
  | { readonly type: 'ready'; readonly backend: string; readonly modelVersion: string }
  | { readonly type: 'prepare-error'; readonly message: string }
  | { readonly type: 'event'; readonly id: number; readonly event: ScanEvent }
  | { readonly type: 'result'; readonly id: number; readonly result: ScanResult }
  | {
      readonly type: 'scan-error';
      readonly id: number;
      readonly code: 'no_baseline' | 'pipeline';
      readonly message: string;
    };
