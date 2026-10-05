"""Export the embedding network to the TensorFlow.js *layers-model* format with float16 weights.

Writes ``model.json`` + ``group1-shardNofM.bin`` (≤ 4 MB per shard) and a ``selftest.json`` with a
deterministic input/expected-embedding pair so the web app's test-suite can verify numerical parity.

This is a self-contained writer (no ``tensorflowjs`` pip dependency, which lacks arm64 wheels via
``tensorflow-decision-forests``). It produces the same artifact layout as
``tensorflowjs_converter --input_format=keras --quantize_float16`` and the export is verified by
``tests/test_export.py`` and by the web package's ``model.parity.test.ts``.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np
import tensorflow as tf

from ..models.siamese import l2_normalize
from ..params import as_metadata

MAX_SHARD_BYTES = 4 * 1024 * 1024


def _weight_name(layer: tf.keras.layers.Layer, weight: tf.Variable) -> str:
    """``block1_conv/kernel:0`` → ``block1_conv/kernel`` (tfjs strips the ``:0`` suffix)."""
    short = weight.name.split("/")[-1].split(":")[0]
    return f"{layer.name}/{short}"


def _keras_version() -> str:
    try:
        import keras

        return str(keras.__version__)
    except Exception:  # pragma: no cover
        return str(tf.__version__)


def _topology(model: tf.keras.Model) -> dict[str, Any]:
    topo = json.loads(model.to_json())
    return {
        "keras_version": topo.get("keras_version", _keras_version()),
        "backend": "tensorflow",
        "model_config": {"class_name": topo["class_name"], "config": topo["config"]},
    }


def export(
    embedding: tf.keras.Model,
    out_dir: str | Path,
    model_version: str,
    threshold: float,
    margin: float = 1.0,
    quantize_float16: bool = True,
) -> dict[str, Any]:
    """Write the TF.js artifact and return the manifest dict."""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    entries: list[dict[str, Any]] = []
    blobs: list[bytes] = []
    for layer in embedding.layers:
        for w in layer.weights:
            value = w.numpy().astype(np.float32)
            entry: dict[str, Any] = {
                "name": _weight_name(layer, w),
                "shape": list(value.shape),
                "dtype": "float32",
            }
            if quantize_float16:
                entry["quantization"] = {"dtype": "float16"}
                blobs.append(value.astype("<f2").tobytes())
            else:
                blobs.append(value.astype("<f4").tobytes())
            entries.append(entry)

    payload = b"".join(blobs)
    shard_count = max(1, -(-len(payload) // MAX_SHARD_BYTES))
    paths = []
    for i in range(shard_count):
        name = f"group1-shard{i + 1}of{shard_count}.bin"
        (out / name).write_bytes(payload[i * MAX_SHARD_BYTES : (i + 1) * MAX_SHARD_BYTES])
        paths.append(name)

    manifest = {
        "format": "layers-model",
        "generatedBy": f"keras v{_keras_version()}",
        "convertedBy": "authentic-edge export_tfjs",
        "modelTopology": _topology(embedding),
        "weightsManifest": [{"paths": paths, "weights": entries}],
        "userDefinedMetadata": {
            **as_metadata(model_version, threshold, margin),
            "weightsSha256": hashlib.sha256(payload).hexdigest(),
        },
    }
    (out / "model.json").write_text(json.dumps(manifest))
    _write_selftest(embedding, out, quantize_float16)
    verify_shards(out)
    return manifest


def _write_selftest(embedding: tf.keras.Model, out: Path, quantized: bool) -> None:
    """Deterministic parity fixture: seeded input → expected (normalised) embedding."""
    size = int(embedding.input_shape[1])
    rng = np.random.default_rng(2024)
    x = rng.random((1, size, size, 1), dtype=np.float32)
    ref = embedding
    if quantized:
        ref = tf.keras.models.clone_model(embedding)
        ref.set_weights([w.astype(np.float16).astype(np.float32) for w in embedding.get_weights()])
    e = l2_normalize(ref(x, training=False)).numpy()[0]
    (out / "selftest.json").write_text(
        json.dumps(
            {
                "seed": 2024,
                "inputSize": size,
                "input": x.reshape(-1).round(6).tolist(),
                "embedding": e.tolist(),
            }
        )
    )


def verify_shards(out_dir: str | Path) -> None:
    """CI gate (plan §8.4): every shard must be ≤ 4 MB and referenced by ``model.json``."""
    out = Path(out_dir)
    manifest = json.loads((out / "model.json").read_text())
    for group in manifest["weightsManifest"]:
        for p in group["paths"]:
            size = (out / p).stat().st_size
            if size > MAX_SHARD_BYTES:
                raise ValueError(f"shard {p} is {size} bytes (> {MAX_SHARD_BYTES})")


def export_placeholder(
    out_dir: str | Path, model_version: str = "0.0.0-placeholder"
) -> dict[str, Any]:
    """Random-weight model with the correct I/O shape (Phase 0 unblocker)."""
    from ..models.siamese import build_embedding_network

    tf.keras.utils.set_random_seed(0)
    return export(build_embedding_network(), out_dir, model_version, threshold=0.5)
