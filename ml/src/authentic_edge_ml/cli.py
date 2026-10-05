"""Command-line entry point: ``python -m authentic_edge_ml.cli <command>``."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def cmd_synth(a: argparse.Namespace) -> None:
    from .data_pipeline.synthetic import generate

    n = generate(a.out, categories=a.categories, per_class=a.per_class, seed=a.seed)
    print(f"wrote {n} synthetic images to {a.out}")


def cmd_manifest(a: argparse.Namespace) -> None:
    from .data_pipeline.acquisition import build_manifest
    from .data_pipeline.labeling import inter_rater_agreement

    m = build_manifest(a.raw, version=a.version)
    m.save(a.out)
    agree, audited = inter_rater_agreement(m.images)
    by_label: dict[str, int] = {}
    for r in m.images:
        by_label[f"{r.product_category}/{r.label}"] = (
            by_label.get(f"{r.product_category}/{r.label}", 0) + 1
        )
    print(f"manifest v{m.version}: {len(m.images)} images → {a.out}")
    for k, v in sorted(by_label.items()):
        print(f"  {k}: {v}")
    print(f"  inter-rater agreement: {agree:.3f} on {audited} audited images")


def cmd_prepare(a: argparse.Namespace) -> None:
    from .data_pipeline.labeling import Manifest
    from .training.dataset import prepare_crops

    n = prepare_crops(Manifest.load(a.manifest), a.out, force=a.force)
    print(f"prepared {n} crops in {a.out}")


def cmd_train(a: argparse.Namespace) -> None:
    from .training.train import load_config, train

    cfg = load_config(
        a.config,
        {
            "epochs": a.epochs,
            "batch_size": a.batch_size,
            "manifest": a.manifest,
            "max_pairs_per_class": a.max_pairs,
        },
    )
    result = train(cfg)
    print(
        json.dumps(
            {
                "threshold": result.threshold,
                "val": result.val_metrics,
                "epochs": result.epochs_run,
                "duration_s": round(result.duration_s, 1),
            },
            indent=2,
        )
    )


def cmd_finalize(a: argparse.Namespace) -> None:
    from .training.train import finalize, load_config

    cfg = load_config(a.config, {"manifest": a.manifest, "max_pairs_per_class": a.max_pairs})
    result = finalize(cfg)
    print(json.dumps({"threshold": result.threshold, "val": result.val_metrics}, indent=2))


def cmd_export(a: argparse.Namespace) -> None:
    import tensorflow as tf

    from .conversion.export_tfjs import export

    ckpt = Path(a.checkpoint)
    emb_path = ckpt.parent / "embedding.keras" if ckpt.name == "siamese_best.keras" else ckpt
    embedding = tf.keras.models.load_model(emb_path, compile=False)
    thr_file = ckpt.parent / "threshold.json"
    threshold = json.loads(thr_file.read_text())["threshold"] if thr_file.exists() else a.threshold
    version_string = a.version_string or f"{a.version}.0.0"
    out = Path(a.out) / f"v{a.version}"
    export(embedding, out, version_string, threshold=threshold, margin=a.margin)
    # Keep a versioned copy of the checkpoint for the worker (BaselineSigner.from_model_version).
    vdir = ckpt.parent / f"v{a.version}"
    vdir.mkdir(parents=True, exist_ok=True)
    embedding.save(vdir / "embedding.keras")
    print(f"exported TF.js model {version_string} (threshold {threshold:.3f}) → {out}")


def cmd_placeholder(a: argparse.Namespace) -> None:
    from .conversion.export_tfjs import export_placeholder

    out = Path(a.out) / f"v{a.version}"
    export_placeholder(out, model_version="0.0.0-placeholder")
    print(f"wrote placeholder model → {out}")


def cmd_baselines(a: argparse.Namespace) -> None:
    """Sign each product category from its training-split authentic images (OEM stand-in)."""
    from .data_pipeline.augmentation import assign_splits
    from .data_pipeline.labeling import Manifest
    from .inference import BaselineSigner

    ckpt = Path(a.checkpoint)
    emb_path = ckpt.parent / "embedding.keras" if ckpt.name == "siamese_best.keras" else ckpt
    signer = BaselineSigner.from_checkpoint(emb_path)
    manifest = Manifest.load(a.manifest)
    images = manifest.usable()
    splits = assign_splits(images)
    categories = sorted({r.product_category for r in images})
    entries: list[dict[str, object]] = []
    for cat in categories:
        refs = [
            manifest.resolve(r)
            for r in images
            if r.product_category == cat
            and r.label == "authentic"
            and splits[r.image_id] == "train"
        ][: a.max_images]
        sig = signer.sign_image_set(refs)
        entries.append(
            {
                "product_category": cat,
                "display_name": cat.replace("_", " ").title(),
                "embedding": [round(v, 6) for v in sig.embedding],
                "orb_descriptors_b64": sig.orb_descriptors_b64,
                "orb_keypoint_count": sig.orb_keypoint_count,
                "image_count": sig.image_count,
            }
        )
        print(f"  {cat}: {sig.image_count} images, {sig.orb_keypoint_count} ORB keypoints")
    out = {"version": f"{a.version}.0.0", "modelVersion": f"{a.version}.0.0", "baselines": entries}
    dest = Path(a.out) / f"v{a.version}" / "baselines.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out))
    print(f"wrote {len(categories)} baselines → {dest}")


def cmd_evaluate(a: argparse.Namespace) -> None:
    from .evaluation.report import evaluate

    ckpt = Path(a.checkpoint)
    emb_path = ckpt.parent / "embedding.keras" if ckpt.name == "siamese_best.keras" else ckpt
    thr_file = ckpt.parent / "threshold.json"
    threshold = json.loads(thr_file.read_text())["threshold"] if thr_file.exists() else a.threshold
    results = evaluate(
        emb_path,
        a.manifest,
        threshold,
        a.out,
        latency_json=a.latency_json,
        model_version=a.model_version,
    )
    print(json.dumps(results, indent=2))
    print(f"report → {a.out}")
    gate = results["adversarial"] or results["edge_simulated"]
    if a.strict and not (gate["recall"] >= 0.95 and gate["precision"] >= 0.85):
        print("GATE FAILED: recall/precision targets not met", file=sys.stderr)
        sys.exit(2)


def cmd_orb_stats(a: argparse.Namespace) -> None:
    """Summarise ORB keypoint counts over the prepared training set (plan §8.3 sweep input)."""
    import numpy as np

    stats = json.loads((Path(a.processed) / "orb_stats.json").read_text())
    counts = np.array(list(stats.values()))
    print(
        json.dumps(
            {
                "images": len(counts),
                "mean": float(counts.mean()),
                "p10": float(np.percentile(counts, 10)),
                "p50": float(np.percentile(counts, 50)),
                "p90": float(np.percentile(counts, 90)),
                "min": int(counts.min()),
                "max": int(counts.max()),
            },
            indent=2,
        )
    )


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="authentic-edge-ml")
    sub = p.add_subparsers(dest="command", required=True)

    s = sub.add_parser("synth", help="generate a synthetic dataset")
    s.add_argument("--out", default="data/raw/synthetic")
    s.add_argument("--categories", type=int, default=2)
    s.add_argument("--per-class", type=int, default=120)
    s.add_argument("--seed", type=int, default=42)
    s.set_defaults(fn=cmd_synth)

    s = sub.add_parser("manifest", help="build a versioned manifest from a raw capture tree")
    s.add_argument("--raw", required=True)
    s.add_argument("--out", required=True)
    s.add_argument("--version", default="1")
    s.set_defaults(fn=cmd_manifest)

    s = sub.add_parser("prepare", help="preprocess + crop every manifest image")
    s.add_argument("--manifest", required=True)
    s.add_argument("--out", default="data/processed")
    s.add_argument("--force", action="store_true")
    s.set_defaults(fn=cmd_prepare)

    s = sub.add_parser("train")
    s.add_argument("--config", default="src/authentic_edge_ml/training/config.yaml")
    s.add_argument("--epochs", type=int)
    s.add_argument("--batch-size", type=int)
    s.add_argument("--manifest")
    s.add_argument("--max-pairs", type=int, dest="max_pairs", help="override max_pairs_per_class")
    s.set_defaults(fn=cmd_train)

    s = sub.add_parser(
        "finalize", help="tune threshold + export embedding.keras from siamese_best.keras"
    )
    s.add_argument("--config", default="src/authentic_edge_ml/training/config.yaml")
    s.add_argument("--manifest")
    s.add_argument("--max-pairs", type=int, dest="max_pairs")
    s.set_defaults(fn=cmd_finalize)

    s = sub.add_parser("export", help="Keras → TF.js (float16, ≤4MB shards)")
    s.add_argument("--checkpoint", default="artifacts/siamese_best.keras")
    s.add_argument("--version", type=int, default=1, help="major version → public/models/v<N>/")
    s.add_argument("--version-string", default=None)
    s.add_argument("--threshold", type=float, default=0.5)
    s.add_argument("--margin", type=float, default=1.0)
    s.add_argument("--out", default="/out/models")
    s.set_defaults(fn=cmd_export)

    s = sub.add_parser("placeholder", help="random-weight TF.js model with correct I/O shape")
    s.add_argument("--out", default="/out/models")
    s.add_argument("--version", default="0-placeholder")
    s.set_defaults(fn=cmd_placeholder)

    s = sub.add_parser("baselines", help="sign product categories → baselines.json")
    s.add_argument("--checkpoint", default="artifacts/siamese_best.keras")
    s.add_argument("--manifest", required=True)
    s.add_argument("--version", type=int, default=1)
    s.add_argument("--max-images", type=int, default=40)
    s.add_argument("--out", default="/out/baselines")
    s.set_defaults(fn=cmd_baselines)

    s = sub.add_parser("evaluate", help="three-condition evaluation report")
    s.add_argument("--checkpoint", default="artifacts/siamese_best.keras")
    s.add_argument("--manifest", required=True)
    s.add_argument("--threshold", type=float, default=0.5)
    s.add_argument("--out", default="reports/evaluation-report.md")
    s.add_argument("--latency-json", default=None)
    s.add_argument("--model-version", default="1.0.0")
    s.add_argument("--strict", action="store_true", help="exit 2 if gates fail (CI promotion)")
    s.set_defaults(fn=cmd_evaluate)

    s = sub.add_parser("orb-stats")
    s.add_argument("--processed", default="data/processed")
    s.set_defaults(fn=cmd_orb_stats)
    return p


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    args.fn(args)


if __name__ == "__main__":
    main()
