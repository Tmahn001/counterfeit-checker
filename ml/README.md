# authentic-edge ML pipeline

Training, conversion and evaluation for the Siamese embedding network (plan Phases 1, 2 and 4).
Everything runs inside the `ml` compose service:

```bash
make ml-synth      # synthetic dev dataset (stands in for Phase 1 macro captures)
make ml-manifest   # versioned manifest with batch-level split metadata
make ml-train      # trains, tunes the decision threshold on val, logs to MLflow (ml/mlruns)
make ml-export     # writes apps/web/public/models/v1/{model.json, *.bin, selftest.json}
make ml-baselines  # writes apps/web/public/baselines/v1/baselines.json
make ml-evaluate   # writes docs/evaluation-report-v1.md (+ confusion matrix PNGs)
```

Package layout (`src/authentic_edge_ml/`):

| module | plan section |
|---|---|
| `data_pipeline/` acquisition, labeling, augmentation, synthetic | §7 |
| `models/` siamese, losses, metrics | §8.1 |
| `training/` train, callbacks, config.yaml | §8.2 |
| `conversion/` export_tfjs | §8.4 |
| `evaluation/` metrics, confusion_matrix, report | §10 |
| `preprocessing.py` | §9.1–9.2 (Python twin of `apps/web/lib/vision`) |
| `inference.py` | §11.5 (`BaselineSigner`, reused by the Celery worker) |
