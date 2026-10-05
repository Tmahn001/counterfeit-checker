"""Contrastive loss (Hadsell, Chopra & LeCun 2006) exactly as specified in plan §8.1."""

from __future__ import annotations

from collections.abc import Callable

import tensorflow as tf


def contrastive_loss(margin: float = 1.0) -> Callable[[tf.Tensor, tf.Tensor], tf.Tensor]:
    """Return a Keras loss ``loss(y_true, d_w)`` for pair distances.

    Y=0 (similar) pulls D_W toward 0; Y=1 (dissimilar) pushes D_W beyond ``margin``.

    Args:
        margin: Contrastive margin ``m``.
    """

    def loss(y_true: tf.Tensor, d_w: tf.Tensor) -> tf.Tensor:
        y_true = tf.cast(tf.reshape(y_true, tf.shape(d_w)), d_w.dtype)
        return tf.reduce_mean(
            (1 - y_true) * 0.5 * tf.square(d_w)
            + y_true * 0.5 * tf.square(tf.maximum(0.0, margin - d_w))
        )

    loss.__name__ = "contrastive_loss"
    return loss
