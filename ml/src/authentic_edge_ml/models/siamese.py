"""Siamese network (plan §8.1).

* ``build_embedding_network``: the single weight-sharing branch — 4 conv blocks (32→64→128→128,
  each Conv3x3 → BatchNorm → ReLU → MaxPool2x2) → GlobalAveragePooling → Dense(128).
  This is the model that gets exported to TensorFlow.js (only standard layers, no Lambda).
* ``build_siamese``: instantiates the branch **once** and calls it twice, then computes the
  Euclidean distance between L2-normalised embeddings. Used for training only.
"""

from __future__ import annotations

import tensorflow as tf

from ..params import MODEL, PREPROCESS

layers = tf.keras.layers


def build_embedding_network(
    input_size: int = PREPROCESS.input_size,
    embedding_dim: int = MODEL.embedding_dim,
    filters: tuple[int, ...] = MODEL.conv_filters,
    name: str = "embedding",
) -> tf.keras.Model:
    """Build the shared CNN branch.

    Args:
        input_size: Side of the square grayscale input.
        embedding_dim: Output embedding dimensionality (128 per thesis).
        filters: Filters per conv block.
        name: Model name (weight names are prefixed by layer names, not this).
    """
    inputs = tf.keras.Input(shape=(input_size, input_size, 1), name="image")
    x = inputs
    for i, f in enumerate(filters, start=1):
        x = layers.Conv2D(f, 3, padding="same", use_bias=False, name=f"block{i}_conv")(x)
        x = layers.BatchNormalization(name=f"block{i}_bn")(x)
        x = layers.ReLU(name=f"block{i}_relu")(x)
        x = layers.MaxPooling2D(2, name=f"block{i}_pool")(x)
    x = layers.GlobalAveragePooling2D(name="gap")(x)
    outputs = layers.Dense(embedding_dim, name="embedding_dense")(x)
    return tf.keras.Model(inputs, outputs, name=name)


def l2_normalize(e: tf.Tensor) -> tf.Tensor:
    """Unit-normalise embeddings so D_W ∈ [0, 2] and the margin is scale-free."""
    return tf.math.l2_normalize(e, axis=-1)


def euclidean_distance(pair: tuple[tf.Tensor, tf.Tensor]) -> tf.Tensor:
    """D_W between two (normalised) embedding batches, shape (B, 1)."""
    a, b = pair
    sq = tf.reduce_sum(tf.square(a - b), axis=-1, keepdims=True)
    return tf.sqrt(tf.maximum(sq, 1e-12))


def build_siamese(
    embedding: tf.keras.Model | None = None,
    input_size: int = PREPROCESS.input_size,
) -> tuple[tf.keras.Model, tf.keras.Model]:
    """Build the two-branch training model around a single shared embedding network.

    Returns:
        (siamese_model, embedding_model). The two branches literally share ``embedding_model``.
    """
    embedding = embedding or build_embedding_network(input_size=input_size)
    in_a = tf.keras.Input(shape=(input_size, input_size, 1), name="image_a")
    in_b = tf.keras.Input(shape=(input_size, input_size, 1), name="image_b")
    e_a = layers.Lambda(l2_normalize, name="norm_a")(embedding(in_a))
    e_b = layers.Lambda(l2_normalize, name="norm_b")(embedding(in_b))
    d_w = layers.Lambda(euclidean_distance, name="distance")([e_a, e_b])
    return tf.keras.Model([in_a, in_b], d_w, name="siamese"), embedding
