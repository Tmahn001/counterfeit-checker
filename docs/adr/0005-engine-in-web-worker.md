# ADR-0005: The vision/inference engine runs in a Web Worker

**Status:** Accepted · **Date:** 2026-09-18

## Context

Plan §14 budgets < 3 s time-to-interactive on a mid-tier device and < 5 s on 3G-equivalent
throttling. A Lighthouse run of the first implementation (engine on the UI thread) measured
21 s of total blocking time and 24 s TTI on `/scan` under the mobile slow-4G simulation: parsing
the 10 MB OpenCV.js bundle and compiling the TF.js model froze the page.

## Decision

OpenCV.js, the TF.js model and the whole authentication pipeline (`lib/scan/pipeline.ts`) run in
a dedicated Web Worker (`lib/scan/engine.worker.ts`). The UI thread only owns the camera preview,
the state machine and telemetry; it transfers the captured RGBA buffer to the worker
(`postMessage` with transfer, no copy) and receives machine events plus the scalar `ScanResult`.
`lib/scan/engineClient.ts` hides the worker behind an interface with an in-thread fallback for
environments without `Worker`.

Measured after the change (Lighthouse 11, mobile slow-4G simulation, two runs on the static export):
total blocking time 80–110 ms, TTI 4.3–4.9 s, first contentful paint 0.8 s, performance score 81;
PWA / accessibility / best-practices 100. (An earlier draft of this ADR quoted 500 ms / 7.4 s;
those were measured against a stale export that did not yet contain the worker chunk.)

## Consequences

- The page stays responsive while the engine loads; the camera guide overlay keeps running.
- WebGL inside a worker needs `OffscreenCanvas`; where unavailable TF.js falls back to WASM
  automatically (plan §12.3) — this is the expected path on older Android WebViews.
- The remaining gap to the 3 s budget is network transfer of OpenCV.js (~10 MB). A custom
  minimal build (core, imgproc, features2d, photo ≈ 3 MB) is the next step (see ADR-0004).
