"""Pair-level metrics computed from D_W at a decision threshold.

Positive class = **counterfeit** (Y=1, predicted when D_W > threshold), so that Recall measures
"fraction of counterfeit pairs caught" — the primary optimisation target (plan §3.4.5 / §10.2).
"""

from __future__ import annotations

import tensorflow as tf


class PairMetric(tf.keras.metrics.Metric):  # type: ignore[misc]
    """Base class accumulating TP/FP/FN/TN over batches for a fixed threshold."""

    def __init__(self, threshold: float, name: str) -> None:
        super().__init__(name=name)
        self.threshold = threshold
        self.tp = self.add_weight(name="tp", initializer="zeros")
        self.fp = self.add_weight(name="fp", initializer="zeros")
        self.fn = self.add_weight(name="fn", initializer="zeros")
        self.tn = self.add_weight(name="tn", initializer="zeros")

    def update_state(
        self, y_true: tf.Tensor, d_w: tf.Tensor, sample_weight: tf.Tensor | None = None
    ) -> None:
        """Accumulate confusion counts for a batch of pair distances."""
        y = tf.cast(tf.reshape(y_true, [-1]), tf.bool)
        pred = tf.reshape(d_w, [-1]) > self.threshold
        self.tp.assign_add(tf.reduce_sum(tf.cast(y & pred, tf.float32)))
        self.fp.assign_add(tf.reduce_sum(tf.cast(~y & pred, tf.float32)))
        self.fn.assign_add(tf.reduce_sum(tf.cast(y & ~pred, tf.float32)))
        self.tn.assign_add(tf.reduce_sum(tf.cast(~y & ~pred, tf.float32)))

    def reset_state(self) -> None:
        """Zero the accumulators at the start of an epoch."""
        for v in (self.tp, self.fp, self.fn, self.tn):
            v.assign(0.0)

    def get_config(self) -> dict[str, object]:
        """Keras serialisation config."""
        return {**super().get_config(), "threshold": self.threshold}


class PairRecall(PairMetric):
    """Counterfeit recall = TP / (TP + FN)."""

    def __init__(self, threshold: float = 0.5, name: str = "recall") -> None:
        super().__init__(threshold, name)

    def result(self) -> tf.Tensor:
        """TP / (TP + FN)."""
        return tf.math.divide_no_nan(self.tp, self.tp + self.fn)


class PairPrecision(PairMetric):
    """Counterfeit precision = TP / (TP + FP)."""

    def __init__(self, threshold: float = 0.5, name: str = "precision") -> None:
        super().__init__(threshold, name)

    def result(self) -> tf.Tensor:
        """TP / (TP + FP)."""
        return tf.math.divide_no_nan(self.tp, self.tp + self.fp)
