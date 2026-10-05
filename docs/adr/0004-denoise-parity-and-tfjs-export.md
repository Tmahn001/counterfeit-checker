# ADR-0004: Denoise step parity and the self-contained TF.js exporter

**Status:** Accepted · **Date:** 2026-09-18

## Context

- Plan §9.1 specifies Non-Local Means denoising. The bundled `@techstark/opencv-js` build does not
  include OpenCV's `photo` module, so `cv.fastNlMeansDenoising` is unavailable in the browser.
- Plan §8.4 uses `tensorflowjs_converter`; the `tensorflowjs` pip package depends on
  `tensorflow-decision-forests`, which has no Linux arm64 wheels, breaking the Docker build on
  Apple-silicon hosts.

## Decision

- The denoise step is parameterised (`denoise_method`: `nlm` | `bilateral`). v1 uses the bilateral
  filter (d=5, σ_color=25, σ_space=5) **on both sides**, so the training distribution equals what the
  device computes. Switching to NLM requires (a) a custom OpenCV.js build with `photo`, (b) retraining
  with `denoise_method: nlm`; the value is embedded in `model.json` so the client follows the model.
- `conversion/export_tfjs.py` writes the TF.js layers-model format directly (topology from
  `model.to_json()`, float16-quantised weights, ≤ 4 MB shards). It also writes `selftest.json`
  (seeded input → expected embedding); `apps/web/lib/inference/model.parity.test.ts` loads the
  artifact with TF.js and asserts numerical parity, which is a stronger check than trusting the
  converter.

## Consequences

- The total cached payload is dominated by the generic OpenCV.js bundle (~10 MB). A custom minimal
  build (core, imgproc, features2d, photo) would cut this to ~3 MB and unlock NLM — tracked as a
  follow-up before the device-lab sprint.
