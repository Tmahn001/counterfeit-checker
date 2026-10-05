"""Single source of truth for hyperparameters shared by training, export and client (plan §21.2).

The client-side TypeScript twin of this file is ``apps/web/lib/vision/params.ts``; the values are
also embedded in ``model.json`` (``userDefinedMetadata``) so the app reads them from the deployed
artifact.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class OrbParams:
    """ORB / matching parameters (plan §8.3)."""

    n_keypoints: int = 500
    fast_threshold: int = 20
    scale_factor: float = 1.2
    n_levels: int = 8
    edge_threshold: int = 31
    patch_size: int = 31
    hamming_threshold: int = 64  # 25% of the 256-bit rBRIEF descriptor
    lowe_ratio: float = 0.75


@dataclass(frozen=True)
class PreprocessParams:
    """Preprocessing parameters (plan §9.1)."""

    clahe_clip_limit: float = 2.0
    clahe_tile_grid: int = 8
    # "nlm" needs OpenCV's photo module, absent from the bundled OpenCV.js build; v1 uses the
    # bilateral filter on BOTH sides so training and on-device inference stay aligned (ADR-0004).
    denoise_method: str = "bilateral"
    bilateral_d: int = 5
    bilateral_sigma_color: float = 25.0
    bilateral_sigma_space: float = 5.0
    nlm_h: float = 10.0
    nlm_template_window: int = 7
    nlm_search_window: int = 21
    roi_fraction: float = 0.75  # side of the keypoint-centred crop, as a fraction of min(H, W)
    input_size: int = 128


@dataclass(frozen=True)
class ModelParams:
    """Siamese network shape and training defaults (plan §8.1–8.2)."""

    embedding_dim: int = 128
    conv_filters: tuple[int, ...] = (32, 64, 128, 128)
    margin: float = 1.0
    learning_rate: float = 1e-3
    batch_size: int = 32
    epochs: int = 50
    early_stopping_patience: int = 8


@dataclass(frozen=True)
class DecisionParams:
    """Client-side decision fusion (see docs/adr/0003-orb-siamese-fusion.md)."""

    threshold: float = 0.5  # D_W decision threshold, tuned on the validation set (init m/2)
    cnn_weight: float = 0.7
    inconclusive_band: float = 0.1
    min_orb_matches: int = 8


ORB = OrbParams()
PREPROCESS = PreprocessParams()
MODEL = ModelParams()
DECISION = DecisionParams()


def as_metadata(
    model_version: str, threshold: float, margin: float = MODEL.margin
) -> dict[str, object]:
    """Build the ``userDefinedMetadata`` block embedded in the exported ``model.json``."""
    return {
        "modelVersion": model_version,
        "inputSize": PREPROCESS.input_size,
        "embeddingDim": MODEL.embedding_dim,
        "margin": margin,
        "decisionThreshold": threshold,
        "orb": asdict(ORB),
        "preprocess": asdict(PREPROCESS),
        "decision": {**asdict(DECISION), "threshold": threshold},
    }
