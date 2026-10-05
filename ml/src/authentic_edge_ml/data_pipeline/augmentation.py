"""Pairing, augmentation and batch-level splitting (plan §7.3).

* Positive pairs (Y=0): authentic–authentic from the **same batch**.
* Negative pairs (Y=1): authentic–counterfeit.
* Augmentation is applied **only to positive pairs** (rotation ±15°, brightness ±10%, blur σ≤1.0).
  Negative pairs stay unaugmented to preserve the forensic authentic/counterfeit difference signal.
* Split is deterministic **by batch** so views of one physical item never straddle train/test.
"""

from __future__ import annotations

import hashlib
import random
from dataclasses import dataclass
from typing import Literal

import cv2
import numpy as np
from numpy.typing import NDArray

from .labeling import ImageRecord

Split = Literal["train", "val", "test", "adversarial"]

POSITIVE = 0  # same-class (authentic/authentic) → contrastive target Y=0
NEGATIVE = 1  # authentic/counterfeit → Y=1

ROTATION_DEG = 15.0
BRIGHTNESS = 0.10
BLUR_SIGMA_MAX = 1.0


@dataclass(frozen=True)
class Pair:
    """A training pair. ``augment`` is only ever True for positive pairs."""

    a: str  # image_id
    b: str
    label: int
    augment: bool
    product_category: str


def _bucket(key: str) -> float:
    """Stable hash → [0,1) so splits are reproducible across machines and runs."""
    h = hashlib.sha256(key.encode()).digest()
    return int.from_bytes(h[:8], "big") / 2**64


def assign_splits(
    images: list[ImageRecord],
    val_fraction: float = 0.15,
    test_fraction: float = 0.15,
) -> dict[str, Split]:
    """Assign a split to every image, keyed by ``oem_batch_id`` (never by image).

    Batches are grouped per (product_category, label), ordered by a stable hash of the batch id,
    and sliced proportionally — so the split is deterministic across machines and every group
    with ≥ 3 batches is represented in train/val/test. Grade-A counterfeits are always routed to
    the ``adversarial`` split and never trained on.
    """
    groups: dict[tuple[str, str], dict[str, list[ImageRecord]]] = {}
    splits: dict[str, Split] = {}
    for r in images:
        if r.counterfeit_grade == "A":
            splits[r.image_id] = "adversarial"
            continue
        batch = r.oem_batch_id or r.image_id
        groups.setdefault((r.product_category, r.label), {}).setdefault(batch, []).append(r)
    for batches in groups.values():
        ordered = sorted(batches, key=_bucket)
        n = len(ordered)
        n_test = max(1, round(n * test_fraction)) if n >= 3 else (1 if n == 2 else 0)
        n_val = max(1, round(n * val_fraction)) if n >= 3 else 0
        for i, batch in enumerate(ordered):
            split: Split = "test" if i < n_test else "val" if i < n_test + n_val else "train"
            for r in batches[batch]:
                splits[r.image_id] = split
    return splits


def make_pairs(
    images: list[ImageRecord],
    split: Split,
    splits: dict[str, Split],
    seed: int = 0,
    max_pairs_per_class: int | None = None,
    augment_positives: bool = True,
) -> list[Pair]:
    """Build a balanced list of positive and negative pairs for one split.

    For the ``adversarial`` split, negatives pair test-split authentic images with grade-A
    counterfeits; positives are drawn from the test split so the two conditions share a baseline.
    """
    rng = random.Random(seed)
    pool_split: Split = "test" if split == "adversarial" else split
    authentic = [r for r in images if r.label == "authentic" and splits[r.image_id] == pool_split]
    counterfeit = [r for r in images if r.label == "counterfeit" and splits[r.image_id] == split]
    by_cat_batch: dict[tuple[str, str], list[ImageRecord]] = {}
    for r in authentic:
        by_cat_batch.setdefault((r.product_category, r.oem_batch_id or r.image_id), []).append(r)

    positives: list[Pair] = []
    for (cat, _batch), items in by_cat_batch.items():
        for i in range(len(items)):
            for j in range(i + 1, len(items)):
                positives.append(
                    Pair(items[i].image_id, items[j].image_id, POSITIVE, augment_positives, cat)
                )

    negatives: list[Pair] = []
    by_cat_fake: dict[str, list[ImageRecord]] = {}
    for r in counterfeit:
        by_cat_fake.setdefault(r.product_category, []).append(r)
    for r in authentic:
        for fake in by_cat_fake.get(r.product_category, []):
            negatives.append(Pair(r.image_id, fake.image_id, NEGATIVE, False, r.product_category))

    rng.shuffle(positives)
    rng.shuffle(negatives)
    n = min(len(positives), len(negatives))
    if max_pairs_per_class is not None:
        n = min(n, max_pairs_per_class)
    pairs = positives[:n] + negatives[:n]
    rng.shuffle(pairs)
    return pairs


def augment_image(crop: NDArray[np.uint8], rng: np.random.Generator) -> NDArray[np.uint8]:
    """Consumer-capture simulation for positive pairs: rotate, brightness jitter, slight blur."""
    h, w = crop.shape[:2]
    angle = float(rng.uniform(-ROTATION_DEG, ROTATION_DEG))
    m = cv2.getRotationMatrix2D((w / 2.0, h / 2.0), angle, 1.0)
    out = cv2.warpAffine(crop, m, (w, h), borderMode=cv2.BORDER_REFLECT_101)
    gain = float(rng.uniform(1.0 - BRIGHTNESS, 1.0 + BRIGHTNESS))
    out = np.clip(out.astype(np.float32) * gain, 0, 255).astype(np.uint8)
    sigma = float(rng.uniform(0.0, BLUR_SIGMA_MAX))
    if sigma > 0.05:
        out = cv2.GaussianBlur(out, (0, 0), sigmaX=sigma)
    return np.asarray(out, dtype=np.uint8)


def check_no_leakage(pairs_by_split: dict[str, list[Pair]], images: list[ImageRecord]) -> None:
    """Raise if any batch appears in more than one of train/val/test."""
    batch_of = {r.image_id: (r.oem_batch_id or r.image_id) for r in images}
    seen: dict[str, str] = {}
    for split, pairs in pairs_by_split.items():
        if split == "adversarial":
            continue
        for p in pairs:
            for image_id in (p.a, p.b):
                b = batch_of[image_id]
                if seen.setdefault(b, split) != split:
                    raise ValueError(f"batch {b} leaks between {seen[b]} and {split}")
