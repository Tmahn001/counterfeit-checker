"""Model shape, weight-sharing and loss tests (plan §8.5)."""

import numpy as np
import tensorflow as tf

from authentic_edge_ml.models.losses import contrastive_loss
from authentic_edge_ml.models.metrics import PairPrecision, PairRecall
from authentic_edge_ml.models.siamese import build_embedding_network, build_siamese


def test_embedding_shape_and_layers():
    m = build_embedding_network()
    assert m.input_shape == (None, 128, 128, 1)
    assert m.output_shape == (None, 128)
    convs = [lyr for lyr in m.layers if isinstance(lyr, tf.keras.layers.Conv2D)]
    assert [c.filters for c in convs] == [32, 64, 128, 128]
    assert not any(isinstance(lyr, tf.keras.layers.Lambda) for lyr in m.layers), "no Lambda"


def test_branches_share_weights():
    siamese, embedding = build_siamese()
    # A single embedding model instance is used for both inputs.
    shared = [lyr for lyr in siamese.layers if lyr is embedding]
    assert len(shared) == 1
    assert len(embedding.inbound_nodes) >= 2  # called on both branch inputs
    x = np.random.rand(2, 128, 128, 1).astype(np.float32)
    d_same = siamese.predict([x, x], verbose=0)
    assert np.allclose(d_same, 0.0, atol=1e-3)
    assert siamese.output_shape == (None, 1)
    trainable = sum(int(np.prod(w.shape)) for w in siamese.trainable_weights)
    assert trainable == sum(int(np.prod(w.shape)) for w in embedding.trainable_weights)


def test_contrastive_loss_values():
    loss = contrastive_loss(margin=1.0)
    d = tf.constant([[0.0], [0.5], [1.5], [0.2]])
    y = tf.constant([[0.0], [1.0], [1.0], [0.0]])
    # y=0: 0.5*d^2 -> 0, 0.02 ; y=1: 0.5*max(0, m-d)^2 -> 0.125, 0
    expected = np.mean([0.0, 0.125, 0.0, 0.02])
    assert float(loss(y, d)) == np.float32(expected)
    assert float(loss(y, d)) >= 0


def test_pair_metrics():
    recall, precision = PairRecall(0.5), PairPrecision(0.5)
    y = tf.constant([[1.0], [1.0], [0.0], [0.0]])
    d = tf.constant([[0.9], [0.2], [0.8], [0.1]])  # TP, FN, FP, TN
    recall.update_state(y, d)
    precision.update_state(y, d)
    assert float(recall.result()) == 0.5
    assert float(precision.result()) == 0.5
