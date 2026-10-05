"""Reproducible evaluation report (plan §10.3).

Given a checkpoint and a manifest, evaluates the three thesis conditions:

* **unconstrained** — held-out test split, full-precision model.
* **edge-simulated** — same pairs through the float16-quantised weights the client actually runs
  (numerical parity with the TF.js artifact); latency numbers are merged from a device benchmark
  JSON exported by the app's ``/bench`` page when provided.
* **adversarial** — test-split authentics against grade-A counterfeits that were never trained on.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import tensorflow as tf

from ..data_pipeline.augmentation import assign_splits, make_pairs
from ..data_pipeline.labeling import Manifest, inter_rater_agreement
from ..models.siamese import euclidean_distance, l2_normalize
from ..training.dataset import load_all_crops, pairs_to_dataset, prepare_crops
from .confusion_matrix import plot_confusion
from .metrics import evaluate_at

CONDITIONS = ("unconstrained", "edge_simulated", "adversarial")


def _distances(embedding: tf.keras.Model, ds: tf.data.Dataset) -> np.ndarray:
    out = []
    for (a, b), _ in ds:
        ea, eb = l2_normalize(embedding(a, training=False)), l2_normalize(
            embedding(b, training=False)
        )
        out.append(euclidean_distance((ea, eb)).numpy().reshape(-1))
    return np.concatenate(out) if out else np.zeros(0)


def _quantized_copy(embedding: tf.keras.Model) -> tf.keras.Model:
    """Clone with weights rounded through float16 — what the client executes after export."""
    clone = tf.keras.models.clone_model(embedding)
    clone.set_weights([w.astype(np.float16).astype(np.float32) for w in embedding.get_weights()])
    return clone


def evaluate(
    embedding_checkpoint: str | Path,
    manifest_path: str | Path,
    threshold: float,
    out_md: str | Path,
    root: str | Path = ".",
    processed_dir: str | Path = "data/processed",
    latency_json: str | Path | None = None,
    plots_dir: str | Path | None = None,
    model_version: str = "unknown",
    targets: tuple[float, float] = (0.95, 0.85),
) -> dict[str, Any]:
    """Run all conditions, write plots + markdown report, return the metrics dict."""
    root = Path(root)
    manifest = Manifest.load(root / manifest_path)
    prepare_crops(manifest, root / processed_dir)
    images = manifest.usable()
    splits = assign_splits(images)
    crops = load_all_crops(root / processed_dir, images)
    embedding = tf.keras.models.load_model(embedding_checkpoint, compile=False)
    quantized = _quantized_copy(embedding)

    test_pairs = make_pairs(images, "test", splits, seed=99)
    adv_pairs = make_pairs(images, "adversarial", splits, seed=99)
    ds_test = pairs_to_dataset(test_pairs, crops, 64, training=False)
    ds_adv = pairs_to_dataset(adv_pairs, crops, 64, training=False) if adv_pairs else None
    y_test = np.array([p.label for p in test_pairs])
    y_adv = np.array([p.label for p in adv_pairs])

    results: dict[str, Any] = {
        "unconstrained": evaluate_at(_distances(embedding, ds_test), y_test, threshold),
        "edge_simulated": evaluate_at(_distances(quantized, ds_test), y_test, threshold),
        "adversarial": (
            evaluate_at(_distances(quantized, ds_adv), y_adv, threshold)
            if ds_adv is not None
            else None
        ),
    }
    latency = json.loads(Path(latency_json).read_text()) if latency_json else None
    agreement, audited = inter_rater_agreement(images)
    plots = Path(plots_dir) if plots_dir else Path(out_md).parent / "evaluation-plots"
    for cond, r in results.items():
        if r is not None:
            plot_confusion(r, cond.replace("_", " "), plots / f"confusion-{cond}.png")

    md = _render(
        results,
        latency,
        threshold,
        manifest,
        len(test_pairs),
        len(adv_pairs),
        agreement,
        audited,
        model_version,
        targets,
        plots,
        Path(out_md),
    )
    Path(out_md).parent.mkdir(parents=True, exist_ok=True)
    Path(out_md).write_text(md)
    (Path(out_md).with_suffix(".json")).write_text(json.dumps(results, indent=2))
    return results


def _row(name: str, r: dict[str, float] | None, targets: tuple[float, float]) -> str:
    if r is None:
        return f"| {name} | – | – | – | – | – | – | n/a |"
    ok = r["recall"] >= targets[0] and r["precision"] >= targets[1]
    return (
        f"| {name} | {int(r['tp'])} | {int(r['tn'])} | {int(r['fp'])} | {int(r['fn'])} | "
        f"{r['precision']:.3f} | {r['recall']:.3f} | {r['f1']:.3f} | {'PASS' if ok else 'FAIL'} |"
    )


def _render(  # noqa: PLR0913
    results: dict[str, Any],
    latency: dict[str, Any] | None,
    threshold: float,
    manifest: Manifest,
    n_test: int,
    n_adv: int,
    agreement: float,
    audited: int,
    model_version: str,
    targets: tuple[float, float],
    plots: Path,
    out_md: Path,
) -> str:
    lines = [
        "# Evaluation report",
        "",
        f"Generated {datetime.now(UTC).isoformat(timespec='seconds')} · model `{model_version}` · "
        f"manifest v{manifest.version} · decision threshold D_W ≤ {threshold:.3f} = authentic",
        "",
        f"Targets (plan §10.2): Recall ≥ {targets[0]:.2f}, Precision ≥ {targets[1]:.2f}, "
        "Recall is the primary objective (a false negative is worse than a false positive).",
        "",
        "## Results by condition",
        "",
        "| Condition | TP | TN | FP | FN | Precision | Recall | F1 | Gate |",
        "|---|---|---|---|---|---|---|---|---|",
        _row("Unconstrained (fp32, test split)", results["unconstrained"], targets),
        _row("Edge-simulated (fp16 weights, test split)", results["edge_simulated"], targets),
        _row("Adversarial (fp16, grade-A counterfeits held out)", results["adversarial"], targets),
        "",
        f"Test pairs: {n_test} · adversarial pairs: {n_adv} · images: {len(manifest.usable())}",
        "",
        "## Confusion matrices",
        "",
    ]
    for cond in CONDITIONS:
        if results.get(cond) is not None:
            rel = (plots / f"confusion-{cond}.png").relative_to(out_md.parent)
            lines.append(f"![{cond}]({rel})")
    lines += ["", "## Inference latency (on-device)", ""]
    if latency:
        lines += [
            "| Backend | Device | p50 (ms) | p95 (ms) | p99 (ms) | Runs |",
            "|---|---|---|---|---|---|",
        ]
        for row in latency.get("runs", []):
            lines.append(
                f"| {row.get('backend')} | {row.get('device')} | {row.get('p50'):.0f} | "
                f"{row.get('p95'):.0f} | {row.get('p99'):.0f} | {row.get('n')} |"
            )
    else:
        lines.append(
            "_No device benchmark supplied. Run the PWA's `/bench` page on each device tier, "
            "download the JSON, and re-run `evaluate --latency-json <file>` to include "
            "p50/p95/p99 here._"
        )
    lines += [
        "",
        "## Dataset QA",
        "",
        f"Inter-rater agreement on audited subsample: {agreement:.3f} over {audited} images "
        f"({'meets' if agreement >= 0.95 else 'below'} the ≥0.95 Objective 1 gate).",
        "",
    ]
    return "\n".join(lines)
