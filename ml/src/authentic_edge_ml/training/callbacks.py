"""Keras callbacks: checkpoint on validation recall, early stopping, MLflow metric logging."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import tensorflow as tf


class MLflowLogger(tf.keras.callbacks.Callback):  # type: ignore[misc]
    """Log every epoch's metrics to the active MLflow run (no-op if MLflow is unavailable)."""

    def on_epoch_end(self, epoch: int, logs: dict[str, Any] | None = None) -> None:
        """Forward Keras epoch logs to MLflow."""
        try:
            import mlflow

            if logs:
                mlflow.log_metrics({k: float(v) for k, v in logs.items()}, step=epoch)
        except Exception:  # pragma: no cover - logging must never break training
            pass


class RecallFirstCheckpoint(tf.keras.callbacks.Callback):  # type: ignore[misc]
    """Save the model when the epoch is better under (val_recall, val_precision, -val_loss).

    Recall is the primary objective (plan §8.2 / §10.2). Once recall saturates (e.g. 1.0 early on),
    a plain ``ModelCheckpoint(monitor="val_recall")`` would never save again even though later
    epochs separate the classes better; ranking by precision and then loss keeps the best of the
    equal-recall epochs.
    """

    def __init__(self, filepath: str | Path, verbose: int = 1) -> None:
        super().__init__()
        self.filepath = str(filepath)
        self.verbose = verbose
        self.best: tuple[float, float, float] | None = None
        self.best_epoch = -1

    @staticmethod
    def key(logs: dict[str, Any]) -> tuple[float, float, float]:
        """Ranking key for an epoch's logs (higher is better)."""
        return (
            float(logs.get("val_recall", 0.0)),
            float(logs.get("val_precision", 0.0)),
            -float(logs.get("val_loss", float("inf"))),
        )

    def on_epoch_end(self, epoch: int, logs: dict[str, Any] | None = None) -> None:
        """Save if this epoch ranks above the best so far."""
        if not logs:
            return
        k = self.key(logs)
        if self.best is None or k > self.best:
            self.best, self.best_epoch = k, epoch
            self.model.save(self.filepath)
            if self.verbose:
                print(
                    f"Epoch {epoch + 1}: new best (recall={k[0]:.4f}, precision={k[1]:.4f}, "
                    f"val_loss={-k[2]:.4f}) → {self.filepath}"
                )


def build_callbacks(artifacts_dir: str | Path, patience: int) -> list[tf.keras.callbacks.Callback]:
    """Checkpoint by recall → precision → loss (never accuracy); early-stop on val loss; MLflow."""
    Path(artifacts_dir).mkdir(parents=True, exist_ok=True)
    return [
        RecallFirstCheckpoint(Path(artifacts_dir) / "siamese_best.keras"),
        tf.keras.callbacks.EarlyStopping(
            monitor="val_loss", patience=patience, restore_best_weights=False, verbose=1
        ),
        MLflowLogger(),
    ]
