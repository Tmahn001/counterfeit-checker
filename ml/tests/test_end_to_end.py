"""Tiny end-to-end run: synth → manifest → train (1 epoch) → export → baselines → evaluate."""

import json

from authentic_edge_ml.cli import main


def test_pipeline_smoke(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("MLFLOW_TRACKING_URI", f"file://{tmp_path}/mlruns")
    main(["synth", "--out", "raw", "--categories", "1", "--per-class", "40"])
    main(["manifest", "--raw", "raw", "--out", "manifest.json", "--version", "t"])
    cfg = tmp_path / "config.yaml"
    cfg.write_text(
        "manifest: manifest.json\nprocessed_dir: processed\nartifacts_dir: artifacts\n"
        "learning_rate: 0.001\nbatch_size: 8\nepochs: 1\nearly_stopping_patience: 2\nmargin: 1.0\n"
        "initial_threshold: 0.5\ntarget_recall: 0.95\ntarget_precision: 0.85\n"
        "max_pairs_per_class: 40\nseed: 1\n"
    )
    main(["train", "--config", str(cfg)])
    assert (tmp_path / "artifacts" / "embedding.keras").exists()
    thr = json.loads((tmp_path / "artifacts" / "threshold.json").read_text())
    assert 0 < thr["threshold"] <= 1.0
    main(
        [
            "export",
            "--checkpoint",
            "artifacts/siamese_best.keras",
            "--version",
            "9",
            "--out",
            "models",
        ]
    )
    assert (tmp_path / "models" / "v9" / "model.json").exists()
    assert (tmp_path / "artifacts" / "v9" / "embedding.keras").exists()
    main(
        [
            "baselines",
            "--checkpoint",
            "artifacts/siamese_best.keras",
            "--manifest",
            "manifest.json",
            "--version",
            "9",
            "--out",
            "baselines",
            "--max-images",
            "5",
        ]
    )
    b = json.loads((tmp_path / "baselines" / "v9" / "baselines.json").read_text())
    assert len(b["baselines"]) == 1 and len(b["baselines"][0]["embedding"]) == 128
    main(
        [
            "evaluate",
            "--checkpoint",
            "artifacts/siamese_best.keras",
            "--manifest",
            "manifest.json",
            "--out",
            "report/eval.md",
        ]
    )
    assert (tmp_path / "report" / "eval.md").exists()
    assert (tmp_path / "report" / "eval.json").exists()
