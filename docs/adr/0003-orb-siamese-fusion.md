# ADR-0003: How ORB features and the Siamese CNN combine

**Status:** Accepted · **Date:** 2026-09-18

## Context

The thesis specifies ORB feature extraction (n=500, FAST ε=20, Hamming ≤ 64, Lowe 0.75) and a
Siamese CNN with contrastive loss, but the plan leaves the _interface_ between them implicit.

## Decision

1. **ORB guides the CNN input.** The preprocessed frame's ORB keypoints locate the region of densest
   micro-detail; a square ROI (75 % of the short side) centred on the median keypoint is resized to
   128×128 and fed to the embedding network. Same code in Python (`preprocessing.roi_crop`) and
   TypeScript (`preprocess.roiCrop`).
2. **Distance is computed against a stored baseline.** Only the embedding branch is exported to
   TF.js. The OEM reference embedding (mean of L2-normalised embeddings of the reference set) ships
   in `baselines.json`; on device `D_W = ‖norm(f(x)) − e_baseline‖₂`.
3. **ORB descriptor matching is a secondary signal.** The medoid reference image's descriptors ship
   alongside the embedding. The client's good-match ratio (Lowe ratio + Hamming threshold, pure TS
   matcher) is fused with the CNN score:
   `score = w·clamp((t − D_W)/t, −1, 1) + (1 − w)·clamp(2·ratio − 1, −1, 1)` with `w = 0.7`, ORB
   omitted when fewer than 8 good matches. `|score| ≤ 0.1` ⇒ _inconclusive_, otherwise the sign
   decides; confidence = `min(1, |score|)`.
4. **The threshold `t` is tuned on the validation set** (highest precision among thresholds with
   recall ≥ 0.95, else max recall) and embedded in `model.json`; the client never hard-codes it.

## Consequences

- The deployed artifact contains only standard Keras layers (no Lambda), so conversion is exact.
- A user-facing explanation can cite both the pattern distance and the number of matched features.
