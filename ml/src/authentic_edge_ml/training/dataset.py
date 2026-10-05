"""Turn a manifest into preprocessed crops and ``tf.data`` pair datasets."""

from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
import tensorflow as tf
from numpy.typing import NDArray

from ..data_pipeline.augmentation import Pair, augment_image
from ..data_pipeline.labeling import ImageRecord, Manifest
from ..params import PREPROCESS
from ..preprocessing import load_image, run_pipeline


def prepare_crops(manifest: Manifest, processed_dir: str | Path, force: bool = False) -> int:
    """Run the client-identical preprocessing once per image and cache 128×128 crops as PNG.

    Also stores each image's ORB descriptor count in ``<processed_dir>/orb_stats.json`` so the ORB
    parameter sweep report can be produced from training-set statistics (plan §8.3).
    """
    out = Path(processed_dir)
    out.mkdir(parents=True, exist_ok=True)
    stats: dict[str, int] = {}
    stats_path = out / "orb_stats.json"
    if stats_path.exists():
        stats = json.loads(stats_path.read_text())
    n = 0
    for r in manifest.usable():
        target = out / f"{r.image_id}.png"
        if target.exists() and not force and r.image_id in stats:
            continue
        result = run_pipeline(load_image(manifest.resolve(r)))
        cv2.imwrite(str(target), result.crop)
        stats[r.image_id] = result.orb.count
        n += 1
    stats_path.write_text(json.dumps(stats))
    return n


def load_crop(processed_dir: str | Path, image_id: str) -> NDArray[np.uint8]:
    """Load a cached crop."""
    img = cv2.imread(str(Path(processed_dir) / f"{image_id}.png"), cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise FileNotFoundError(image_id)
    return np.asarray(img, dtype=np.uint8)


def load_all_crops(
    processed_dir: str | Path, images: list[ImageRecord]
) -> dict[str, NDArray[np.uint8]]:
    """Load every usable crop into memory (datasets here are small: hundreds to low thousands)."""
    return {r.image_id: load_crop(processed_dir, r.image_id) for r in images}


def pairs_to_dataset(
    pairs: list[Pair],
    crops: dict[str, NDArray[np.uint8]],
    batch_size: int,
    training: bool,
    seed: int = 0,
) -> tf.data.Dataset:
    """Build a batched ``tf.data.Dataset`` of ((img_a, img_b), y) float32 tensors.

    Augmentation (positives only) is applied on the fly through ``tf.numpy_function`` so each epoch
    sees a fresh perturbation.
    """
    size = PREPROCESS.input_size
    a = np.stack([crops[p.a] for p in pairs]).astype(np.uint8)
    b = np.stack([crops[p.b] for p in pairs]).astype(np.uint8)
    y = np.array([p.label for p in pairs], dtype=np.float32)
    aug = np.array([p.augment for p in pairs], dtype=np.bool_)
    rng = np.random.default_rng(seed)

    def _augment(
        img_a: np.ndarray, img_b: np.ndarray, do_aug: np.ndarray
    ) -> tuple[np.ndarray, np.ndarray]:
        if bool(do_aug):
            img_a = augment_image(img_a, rng)
            img_b = augment_image(img_b, rng)
        return img_a, img_b

    def _map(img_a: tf.Tensor, img_b: tf.Tensor, do_aug: tf.Tensor, label: tf.Tensor):  # type: ignore[no-untyped-def]
        if training:
            img_a, img_b = tf.numpy_function(_augment, [img_a, img_b, do_aug], [tf.uint8, tf.uint8])
        img_a = tf.reshape(tf.cast(img_a, tf.float32) / 255.0, (size, size, 1))
        img_b = tf.reshape(tf.cast(img_b, tf.float32) / 255.0, (size, size, 1))
        return (img_a, img_b), tf.reshape(label, (1,))

    ds = tf.data.Dataset.from_tensor_slices((a, b, aug, y))
    if training:
        ds = ds.shuffle(len(pairs), seed=seed, reshuffle_each_iteration=True)
    ds = ds.map(_map, num_parallel_calls=tf.data.AUTOTUNE)
    return ds.batch(batch_size).prefetch(tf.data.AUTOTUNE)
