import json

import numpy as np
import tensorflow as tf

from authentic_edge_ml.conversion.export_tfjs import MAX_SHARD_BYTES, export, export_placeholder
from authentic_edge_ml.models.siamese import build_embedding_network


def test_export_layout_and_metadata(tmp_path):
    m = build_embedding_network()
    manifest = export(m, tmp_path, "1.2.3", threshold=0.42)
    assert (tmp_path / "model.json").exists()
    assert manifest["format"] == "layers-model"
    names = [w["name"] for w in manifest["weightsManifest"][0]["weights"]]
    assert "block1_conv/kernel" in names and "embedding_dense/bias" in names
    assert all(
        w["quantization"]["dtype"] == "float16" for w in manifest["weightsManifest"][0]["weights"]
    )
    meta = manifest["userDefinedMetadata"]
    assert meta["modelVersion"] == "1.2.3" and meta["decisionThreshold"] == 0.42
    assert meta["orb"]["n_keypoints"] == 500 and meta["orb"]["fast_threshold"] == 20
    total = sum((tmp_path / p).stat().st_size for p in manifest["weightsManifest"][0]["paths"])
    expected = sum(int(np.prod(w.shape)) for w in m.weights) * 2
    assert total == expected
    assert all(
        (tmp_path / p).stat().st_size <= MAX_SHARD_BYTES
        for p in manifest["weightsManifest"][0]["paths"]
    )
    topo = manifest["modelTopology"]["model_config"]
    assert topo["class_name"] == "Functional"
    assert not any(lyr["class_name"] == "Lambda" for lyr in topo["config"]["layers"])


def test_selftest_fixture_matches_quantized_model(tmp_path):
    m = build_embedding_network()
    export(m, tmp_path, "0.0.1", threshold=0.5)
    fx = json.loads((tmp_path / "selftest.json").read_text())
    x = np.array(fx["input"], np.float32).reshape(1, 128, 128, 1)
    q = tf.keras.models.clone_model(m)
    q.set_weights([w.astype(np.float16).astype(np.float32) for w in m.get_weights()])
    e = tf.math.l2_normalize(q(x, training=False), axis=-1).numpy()[0]
    assert np.allclose(e, np.array(fx["embedding"]), atol=1e-4)


def test_placeholder(tmp_path):
    manifest = export_placeholder(tmp_path)
    assert manifest["userDefinedMetadata"]["modelVersion"] == "0.0.0-placeholder"
