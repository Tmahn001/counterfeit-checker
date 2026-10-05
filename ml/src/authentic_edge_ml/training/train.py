"""Train the Siamese network from a manifest (plan §8.2).

Steps: load manifest → assign batch-level splits → build balanced pairs (leakage check) →
train with contrastive loss → checkpoint on val recall → tune the decision threshold on val →
write ``artifacts/{siamese_best.keras, embedding.keras, threshold.json}`` and log to MLflow.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import tensorflow as tf
import yaml

from ..data_pipeline.augmentation import (
    Pair,
    Split,
    assign_splits,
    check_no_leakage,
    make_pairs,
)
from ..data_pipeline.labeling import Manifest
from ..evaluation.metrics import tune_threshold
from ..models.losses import contrastive_loss
from ..models.metrics import PairPrecision, PairRecall
from ..models.siamese import build_siamese
from .callbacks import build_callbacks
from .dataset import load_all_crops, pairs_to_dataset, prepare_crops


@dataclass
class TrainResult:
    """Summary of a training run."""

    checkpoint: Path
    embedding_checkpoint: Path
    threshold: float
    val_metrics: dict[str, float]
    epochs_run: int
    duration_s: float


def load_config(path: str | Path, overrides: dict[str, Any] | None = None) -> dict[str, Any]:
    """Load ``config.yaml`` with optional CLI overrides."""
    cfg = yaml.safe_load(Path(path).read_text())
    cfg.update({k: v for k, v in (overrides or {}).items() if v is not None})
    return dict(cfg)


def train(cfg: dict[str, Any], root: str | Path = ".") -> TrainResult:
    """Run one training job described by ``cfg`` (paths relative to ``root``)."""
    root = Path(root)
    tf.keras.utils.set_random_seed(int(cfg["seed"]))
    manifest = Manifest.load(root / cfg["manifest"])
    processed = root / cfg["processed_dir"]
    artifacts = root / cfg["artifacts_dir"]
    prepare_crops(manifest, processed)

    images = manifest.usable()
    splits = assign_splits(images)
    cap = cfg.get("max_pairs_per_class")
    order: tuple[Split, ...] = ("train", "val", "test")
    pairs: dict[str, list[Pair]] = {
        s: make_pairs(images, s, splits, seed=int(cfg["seed"]) + i, max_pairs_per_class=cap)
        for i, s in enumerate(order)
    }
    check_no_leakage(pairs, images)
    for s, ps in pairs.items():
        if not ps:
            raise RuntimeError(f"no pairs for split {s!r} — dataset too small or unbalanced")
    crops = load_all_crops(processed, images)
    bs = int(cfg["batch_size"])
    ds_train = pairs_to_dataset(pairs["train"], crops, bs, training=True, seed=int(cfg["seed"]))
    ds_val = pairs_to_dataset(pairs["val"], crops, bs, training=False)

    margin = float(cfg["margin"])
    t0 = float(cfg["initial_threshold"])
    siamese, embedding = build_siamese()
    siamese.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=float(cfg["learning_rate"])),
        loss=contrastive_loss(margin),
        metrics=[PairRecall(t0), PairPrecision(t0)],
    )

    run = _mlflow_start(cfg, manifest, {k: len(v) for k, v in pairs.items()})
    started = time.perf_counter()
    history = siamese.fit(
        ds_train,
        validation_data=ds_val,
        epochs=int(cfg["epochs"]),
        callbacks=build_callbacks(artifacts, int(cfg["early_stopping_patience"])),
        verbose=2,
    )
    duration = time.perf_counter() - started

    best_path = artifacts / "siamese_best.keras"
    if best_path.exists():
        siamese.load_weights(best_path)
    # Tune the decision threshold on the validation set (never on test).
    d_val = siamese.predict(ds_val, verbose=0).reshape(-1)
    y_val = np.array([p.label for p in pairs["val"]], dtype=np.int64)
    threshold, val_metrics = tune_threshold(
        d_val, y_val, target_recall=float(cfg["target_recall"]), margin=margin
    )
    embedding_path = artifacts / "embedding.keras"
    embedding.save(embedding_path)
    siamese.save(best_path)
    (artifacts / "threshold.json").write_text(
        json.dumps(
            {
                "threshold": threshold,
                "margin": margin,
                "val_metrics": val_metrics,
                "manifest_version": manifest.version,
            },
            indent=2,
        )
    )
    _mlflow_end(run, val_metrics, threshold, artifacts)
    return TrainResult(
        checkpoint=best_path,
        embedding_checkpoint=embedding_path,
        threshold=threshold,
        val_metrics=val_metrics,
        epochs_run=len(history.history.get("loss", [])),
        duration_s=duration,
    )


def finalize(cfg: dict[str, Any], root: str | Path = ".") -> TrainResult:
    """Tune the threshold and export ``embedding.keras`` from an existing ``siamese_best.keras``.

    Lets an interrupted (or externally trained) run be promoted without re-training.
    """
    root = Path(root)
    manifest = Manifest.load(root / cfg["manifest"])
    processed = root / cfg["processed_dir"]
    artifacts = root / cfg["artifacts_dir"]
    prepare_crops(manifest, processed)
    images = manifest.usable()
    splits = assign_splits(images)
    val_pairs = make_pairs(images, "val", splits, seed=int(cfg["seed"]) + 1)
    crops = load_all_crops(processed, images)
    ds_val = pairs_to_dataset(val_pairs, crops, int(cfg["batch_size"]), training=False)
    margin = float(cfg["margin"])
    siamese, embedding = build_siamese()
    siamese.load_weights(artifacts / "siamese_best.keras")
    d_val = siamese.predict(ds_val, verbose=0).reshape(-1)
    y_val = np.array([p.label for p in val_pairs], dtype=np.int64)
    threshold, val_metrics = tune_threshold(
        d_val, y_val, target_recall=float(cfg["target_recall"]), margin=margin
    )
    embedding_path = artifacts / "embedding.keras"
    embedding.save(embedding_path)
    (artifacts / "threshold.json").write_text(
        json.dumps(
            {
                "threshold": threshold,
                "margin": margin,
                "val_metrics": val_metrics,
                "manifest_version": manifest.version,
            },
            indent=2,
        )
    )
    return TrainResult(
        checkpoint=artifacts / "siamese_best.keras",
        embedding_checkpoint=embedding_path,
        threshold=threshold,
        val_metrics=val_metrics,
        epochs_run=0,
        duration_s=0.0,
    )


def _mlflow_start(cfg: dict[str, Any], manifest: Manifest, pair_counts: dict[str, int]) -> Any:
    try:
        import mlflow

        mlflow.set_experiment(str(cfg.get("experiment", "authentic-edge")))
        run = mlflow.start_run()
        mlflow.log_params(
            {
                **{k: v for k, v in cfg.items() if isinstance(v, int | float | str)},
                "manifest_version": manifest.version,
                "n_images": len(manifest.usable()),
                **{f"pairs_{k}": v for k, v in pair_counts.items()},
            }
        )
        return run
    except Exception:
        return None


def _mlflow_end(run: Any, metrics: dict[str, float], threshold: float, artifacts: Path) -> None:
    if run is None:
        return
    try:
        import mlflow

        mlflow.log_metrics({f"val_{k}": v for k, v in metrics.items()})
        mlflow.log_metric("decision_threshold", threshold)
        mlflow.log_artifact(str(artifacts / "threshold.json"))
        mlflow.end_run()
    except Exception:
        pass
