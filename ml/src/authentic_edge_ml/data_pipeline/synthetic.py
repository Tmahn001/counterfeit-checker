"""Synthetic macro-print dataset generator.

Stands in for Phase 1 captures so the whole pipeline (manifest → pairs → training → export →
client) can be exercised end-to-end before the real dataset exists. Each *product category* has a
procedurally generated packaging design; authentic items reproduce it with a fine microprint texture
and per-batch/per-item printing variance, while counterfeits reproduce the visible design but with
the wrong microprint frequency, a coarser halftone and softer edges. Grade-A counterfeits deviate
much less and are held out for adversarial evaluation.
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray

SIZE = 256


def _design(rng: np.random.Generator, size: int = SIZE) -> tuple[NDArray[np.float32], float]:
    """Base packaging design: gratings + glyph-like blocks + a microprint frequency."""
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    img = np.full((size, size), 0.85, np.float32)
    for _ in range(3):
        fx, fy = rng.uniform(0.02, 0.08, size=2)
        phase = rng.uniform(0, 2 * np.pi)
        img += 0.05 * np.sin(2 * np.pi * (fx * x + fy * y) + phase)
    for _ in range(rng.integers(6, 12)):
        w, h = rng.integers(12, 50, size=2)
        x0, y0 = rng.integers(0, size - 50, size=2)
        img[y0 : y0 + h, x0 : x0 + w] = rng.uniform(0.1, 0.4)
    micro_freq = float(rng.uniform(0.18, 0.30))  # cycles/pixel of the security microprint
    return img, micro_freq


def _microprint(size: int, freq: float, phase: float, angle: float) -> NDArray[np.float32]:
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    c, s = np.cos(angle), np.sin(angle)
    return np.asarray(
        0.08 * np.sign(np.sin(2 * np.pi * freq * (c * x + s * y) + phase)), np.float32
    )


def _halftone(rng: np.random.Generator, size: int, pitch: int) -> NDArray[np.float32]:
    y, x = np.mgrid[0:size, 0:size]
    dots = ((x % pitch < 2) & (y % pitch < 2)).astype(np.float32)
    return 0.12 * dots


def render_item(
    design: NDArray[np.float32],
    micro_freq: float,
    rng: np.random.Generator,
    counterfeit: bool,
    grade_a: bool = False,
    batch_offset: float = 0.0,
) -> NDArray[np.uint8]:
    """Render one physical item as a grayscale macro photograph."""
    size = design.shape[0]
    img: NDArray[np.float32] = (design + batch_offset).astype(np.float32)
    angle = rng.uniform(0, np.pi)
    if counterfeit:
        deviation = 0.06 if grade_a else 0.25
        freq = micro_freq * (1 + rng.choice([-1, 1]) * deviation)
        img = img + _microprint(size, freq, rng.uniform(0, 2 * np.pi), angle)
        img = img + _halftone(rng, size, pitch=4 if grade_a else 6)
        img = np.asarray(cv2.GaussianBlur(img, (0, 0), sigmaX=0.6 if grade_a else 1.2), np.float32)
    else:
        img = img + _microprint(size, micro_freq, rng.uniform(0, 2 * np.pi), angle)
        img = img + _halftone(rng, size, pitch=3)
    # Per-item capture variance: small shift/rotation, illumination gradient, sensor noise.
    m = np.asarray(
        cv2.getRotationMatrix2D(
            (size / 2, size / 2), float(rng.uniform(-5, 5)), float(rng.uniform(0.97, 1.03))
        ),
        np.float64,
    )
    m[:, 2] = m[:, 2] + rng.uniform(-6, 6, size=2)
    img = np.asarray(
        cv2.warpAffine(img, m, (size, size), borderMode=cv2.BORDER_REFLECT_101), np.float32
    )
    gx, gy = rng.uniform(-0.08, 0.08, size=2)
    y, x = np.mgrid[0:size, 0:size].astype(np.float32) / size
    img = (img * (1 + gx * (x - 0.5) + gy * (y - 0.5))).astype(np.float32)
    img = img + rng.normal(0, 0.02, img.shape).astype(np.float32)
    return np.clip(img * 255, 0, 255).astype(np.uint8)


def generate(
    out_dir: str | Path,
    categories: int = 2,
    per_class: int = 120,
    batch_size: int = 10,
    grade_a_fraction: float = 0.25,
    seed: int = 42,
) -> int:
    """Write a synthetic dataset in the acquisition layout. Returns number of images written."""
    rng = np.random.default_rng(seed)
    out = Path(out_dir)
    written = 0
    for c in range(categories):
        cat = f"synthetic_product_{c + 1:02d}"
        design, micro = _design(rng)
        n_grade_a = int(per_class * grade_a_fraction)
        plan = [
            ("authentic", per_class, False, False),
            ("counterfeit", per_class - n_grade_a, True, False),
            ("counterfeit_grade_a", n_grade_a, True, True),
        ]
        for label_dir, count, fake, grade_a in plan:
            for i in range(count):
                batch = i // batch_size
                batch_offset = float(rng.normal(0, 0.01)) if i % batch_size == 0 else 0.0
                img = render_item(design, micro, rng, fake, grade_a, batch_offset)
                path = out / cat / label_dir / f"batch_{batch:03d}" / f"item_{i:04d}.png"
                path.parent.mkdir(parents=True, exist_ok=True)
                cv2.imwrite(str(path), img)
                written += 1
    return written
