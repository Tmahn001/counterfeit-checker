"""Server-side signing of OEM reference image sets (plan §11.5).

Reuses the exact preprocessing/ORB/embedding code paths used in training and mirrored on the client.
Only OEM reference photographs pass through here — never consumer captures.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .preprocessing import OrbFeatures, load_image, run_pipeline, to_capture_frame


@dataclass
class BaselineSignature:
    """What ships to clients for one product category."""

    embedding: list[float]  # 128-dim, L2-normalised
    orb_descriptors_b64: str  # base64(uint8[N,32]) from the medoid reference image
    orb_keypoint_count: int
    image_count: int


class BaselineSigner:
    """Loads an embedding checkpoint and signs image sets."""

    def __init__(self, embedding_model: object) -> None:
        self.model = embedding_model

    @classmethod
    def from_checkpoint(cls, path: str | Path) -> BaselineSigner:
        """Load ``embedding.keras`` from disk."""
        import tensorflow as tf

        return cls(tf.keras.models.load_model(path, compile=False))

    @classmethod
    def from_model_version(cls, version_string: str) -> BaselineSigner:
        """Resolve the checkpoint for a registry version.

        Looks for ``$ML_ARTIFACTS_DIR/v<major>/embedding.keras``, falling back to
        ``$ML_ARTIFACTS_DIR/embedding.keras``.
        """
        base = Path(os.environ.get("ML_ARTIFACTS_DIR", "/ml/artifacts"))
        major = version_string.split(".")[0].lstrip("v")
        for candidate in (base / f"v{major}" / "embedding.keras", base / "embedding.keras"):
            if candidate.exists():
                return cls.from_checkpoint(candidate)
        raise FileNotFoundError(
            f"no embedding checkpoint for model version {version_string} in {base}"
        )

    def embed(self, tensors: np.ndarray) -> np.ndarray:
        """Normalised embeddings for a batch of (N, H, W, 1) float32 inputs."""
        e = np.asarray(self.model(tensors, training=False))  # type: ignore[operator]
        return e / np.maximum(np.linalg.norm(e, axis=-1, keepdims=True), 1e-12)

    def sign_image_set(self, paths: list[str], normalize: bool = False) -> BaselineSignature:
        """Mean-normalised embedding + ORB descriptors from the medoid image.

        Args:
            paths: Reference image files of one genuine product.
            normalize: Re-frame each photo like a scanner capture (centre square, 512 px). Used for
                OEM uploads; off for dataset images that are already at pipeline scale.
        """
        if not paths:
            raise ValueError("empty image set")
        outputs = [
            run_pipeline(to_capture_frame(load_image(p)) if normalize else load_image(p))
            for p in paths
        ]
        batch = np.stack([o.tensor for o in outputs])
        embeddings = self.embed(batch)
        mean = embeddings.mean(axis=0)
        mean /= max(float(np.linalg.norm(mean)), 1e-12)
        medoid = int(np.argmin(np.linalg.norm(embeddings - mean, axis=1)))
        orb: OrbFeatures = outputs[medoid].orb
        return BaselineSignature(
            embedding=[float(v) for v in mean],
            orb_descriptors_b64=orb.descriptors_b64(),
            orb_keypoint_count=orb.count,
            image_count=len(paths),
        )
