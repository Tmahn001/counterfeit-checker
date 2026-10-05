'use client';
/**
 * React hook wiring the state machine, the engine (in a Web Worker), the pipeline and telemetry.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { env } from '../env';
import {
  initialScanState,
  scanReducer,
  type ScanErrorCode,
  type ScanResult,
  type ScanState,
} from './machine';
import { createEngineClient, ScanError, type EngineClient } from './engineClient';
import {
  buildTelemetryPayload,
  defaultSender,
  enqueue,
  getCoarseGeo,
  installOnlineFlush,
} from '../telemetry';

export type EngineStatus =
  | { readonly phase: 'loading'; readonly stage: string; readonly progress: number }
  | { readonly phase: 'ready'; readonly backend: string; readonly modelVersion: string }
  | { readonly phase: 'failed'; readonly message: string };

export interface ScanFlow {
  readonly state: ScanState;
  readonly engine: EngineStatus;
  readonly scan: (frame: ImageData, productCategory: string) => Promise<ScanResult | null>;
  readonly reset: () => void;
  readonly fail: (code: ScanErrorCode, message: string) => void;
}

export function useScanFlow(): ScanFlow {
  const [state, dispatch] = useReducer(scanReducer, initialScanState);
  const [engine, setEngine] = useState<EngineStatus>({
    phase: 'loading',
    stage: 'opencv',
    progress: 0,
  });
  const clientRef = useRef<EngineClient | null>(null);
  const readyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    installOnlineFlush(defaultSender(env.apiBaseUrl));
    const client = createEngineClient();
    clientRef.current = client;
    client
      .prepare(env.modelManifestUrl, env.baselinesUrl, {
        onStage: (stage) => !cancelled && setEngine({ phase: 'loading', stage, progress: 0 }),
        onProgress: (p) =>
          !cancelled && setEngine({ phase: 'loading', stage: 'model', progress: p }),
      })
      .then((ready) => {
        readyRef.current = true;
        if (!cancelled)
          setEngine({ phase: 'ready', backend: ready.backend, modelVersion: ready.modelVersion });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setEngine({ phase: 'failed', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
      client.dispose();
      clientRef.current = null;
    };
  }, []);

  const scan = useCallback(async (frame: ImageData, productCategory: string) => {
    const client = clientRef.current;
    if (!client || !readyRef.current) {
      dispatch({ type: 'FAIL', code: 'model_load', message: 'engine not ready' });
      return null;
    }
    dispatch({ type: 'CAPTURE' });
    try {
      const result = await client.scan(frame, productCategory, dispatch);
      // Telemetry is fire-and-forget and happens *after* the verdict is on screen.
      void (async () => {
        const geo = await getCoarseGeo();
        await enqueue(
          buildTelemetryPayload({
            productCategory,
            decision: result.decision,
            modelVersion: result.modelVersion,
            backend: result.backend,
            inferenceMs: result.timings.inferMs,
            geo,
          }),
        );
      })().catch(() => undefined);
      return result;
    } catch (err: unknown) {
      const code: ScanErrorCode = err instanceof ScanError ? err.code : 'pipeline';
      dispatch({ type: 'FAIL', code, message: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }, []);

  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);
  const fail = useCallback(
    (code: ScanErrorCode, message: string) => dispatch({ type: 'FAIL', code, message }),
    [],
  );
  return { state, engine, scan, reset, fail };
}
