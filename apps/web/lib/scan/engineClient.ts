/**
 * UI-thread facade over the engine worker, with an in-thread fallback for environments without
 * `Worker` (tests, very old browsers). Both implement the same interface.
 */
import { currentBackend } from '../inference/backend';
import type { ScanEvent, ScanResult } from './machine';
import { PipelineError, prepareEngine, runPipeline, type Engine } from './pipeline';
import type { EngineStage, FromWorker, ToWorker } from './protocol';

export interface PrepareCallbacks {
  readonly onStage?: (stage: EngineStage) => void;
  readonly onProgress?: (fraction: number) => void;
}
export interface EngineReady {
  readonly backend: string;
  readonly modelVersion: string;
}
export interface EngineClient {
  prepare(
    modelManifestUrl: string,
    baselinesUrl: string,
    cb: PrepareCallbacks,
  ): Promise<EngineReady>;
  scan(
    frame: ImageData,
    productCategory: string,
    dispatch: (e: ScanEvent) => void,
  ): Promise<ScanResult>;
  dispose(): void;
}

export class ScanError extends Error {
  constructor(
    public readonly code: 'no_baseline' | 'pipeline',
    message: string,
  ) {
    super(message);
  }
}

class WorkerEngineClient implements EngineClient {
  private readonly worker: Worker;
  private nextId = 1;
  private readonly pending = new Map<
    number,
    {
      dispatch: (e: ScanEvent) => void;
      resolve: (r: ScanResult) => void;
      reject: (e: Error) => void;
    }
  >();
  private prepareHandlers: {
    cb: PrepareCallbacks;
    resolve: (r: EngineReady) => void;
    reject: (e: Error) => void;
  } | null = null;

  constructor() {
    this.worker = new Worker(new URL('./engine.worker.ts', import.meta.url));
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.handle(e.data);
    this.worker.onerror = (e) =>
      this.prepareHandlers?.reject(new Error(e.message || 'engine worker failed'));
  }

  private handle(m: FromWorker): void {
    switch (m.type) {
      case 'stage':
        this.prepareHandlers?.cb.onStage?.(m.stage);
        break;
      case 'progress':
        this.prepareHandlers?.cb.onProgress?.(m.fraction);
        break;
      case 'ready':
        this.prepareHandlers?.resolve({ backend: m.backend, modelVersion: m.modelVersion });
        break;
      case 'prepare-error':
        this.prepareHandlers?.reject(new Error(m.message));
        break;
      case 'event':
        this.pending.get(m.id)?.dispatch(m.event);
        break;
      case 'result':
        this.pending.get(m.id)?.resolve(m.result);
        this.pending.delete(m.id);
        break;
      case 'scan-error':
        this.pending.get(m.id)?.reject(new ScanError(m.code, m.message));
        this.pending.delete(m.id);
        break;
    }
  }

  prepare(
    modelManifestUrl: string,
    baselinesUrl: string,
    cb: PrepareCallbacks,
  ): Promise<EngineReady> {
    return new Promise((resolve, reject) => {
      this.prepareHandlers = { cb, resolve, reject };
      const msg: ToWorker = { type: 'prepare', modelManifestUrl, baselinesUrl };
      this.worker.postMessage(msg);
    });
  }

  scan(
    frame: ImageData,
    productCategory: string,
    dispatch: (e: ScanEvent) => void,
  ): Promise<ScanResult> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { dispatch, resolve, reject });
      const buffer = frame.data.buffer.slice(0);
      const msg: ToWorker = {
        type: 'scan',
        id,
        frame: { data: buffer, width: frame.width, height: frame.height },
        productCategory,
      };
      this.worker.postMessage(msg, [buffer]); // transferred, not copied
    });
  }

  dispose(): void {
    this.worker.terminate();
  }
}

class InThreadEngineClient implements EngineClient {
  private engine: Engine | null = null;
  async prepare(
    modelManifestUrl: string,
    baselinesUrl: string,
    cb: PrepareCallbacks,
  ): Promise<EngineReady> {
    this.engine = await prepareEngine({
      modelManifestUrl,
      baselinesUrl,
      onStage: cb.onStage,
      onModelProgress: cb.onProgress,
    });
    return { backend: currentBackend(), modelVersion: this.engine.metadata.modelVersion };
  }
  async scan(
    frame: ImageData,
    productCategory: string,
    dispatch: (e: ScanEvent) => void,
  ): Promise<ScanResult> {
    if (!this.engine) throw new ScanError('pipeline', 'engine not ready');
    try {
      return await runPipeline({ engine: this.engine, frame, productCategory, dispatch });
    } catch (err: unknown) {
      throw new ScanError(
        err instanceof PipelineError ? err.code : 'pipeline',
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  dispose(): void {
    this.engine = null;
  }
}

export function createEngineClient(): EngineClient {
  return typeof Worker === 'function' ? new WorkerEngineClient() : new InThreadEngineClient();
}
