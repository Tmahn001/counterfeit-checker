# authentic-edge

AI-based counterfeit product authentication: a Progressive Web App that authenticates physical
products from macro-photographic capture **entirely on the client** (OpenCV.js preprocessing →
ORB features → Siamese CNN in TensorFlow.js), plus a thin Django administrative backend for OEM
baseline registration, model distribution and anonymised telemetry.

Author: Tolulope Iwalewa (KclautHQ) · Implementation of the thesis design (Chapters 1–3).

## Architecture in one paragraph

The browser captures a frame, converts it to grayscale, normalises illumination (CLAHE), denoises,
extracts ≤ 500 ORB keypoints, crops the keypoint-dense region to 128×128 and runs it through the
embedding branch of a Siamese network. The Euclidean distance `D_W` to the manufacturer's reference
embedding (shipped in `baselines.json`) plus the ORB good-match ratio yield the verdict. No image
ever leaves the device; the backend cannot even receive one. After first load the app runs fully
offline (Workbox service worker + IndexedDB model cache). See `docs/adr/` for design decisions.

```
apps/web   Next.js 14 PWA (static export)      apps/api   Django 4.2 + DRF + Celery
ml/        training / TF.js export / evaluation packages/shared-types   shared TS contracts
infra/     docker compose + nginx              docs/      ADRs, runbooks, reports
```

## Quick start (Docker Compose only)

Requirements: Docker with Compose v2 (Docker Desktop, OrbStack or Colima) and `make`.

```bash
make setup        # first time only: .env, images, and a trained model if none exists
make up           # every day: starts Docker (Colima) if needed, then the whole stack
make help         # every command, with a one-line description
make urls         # where each service is, and the dev sign-ins
make down         # stop (the database is kept; `make clean` wipes it)
make logs         # follow the logs; `make ps` shows what is running
make https        # add the HTTPS front door so a phone on the same Wi-Fi can use the camera
```

`make up` is safe to re-run: it rebuilds only what changed and leaves your data alone.

| Service        | URL                                             | Notes                                                         |
| -------------- | ----------------------------------------------- | ------------------------------------------------------------- |
| PWA            | http://localhost:3000                           | `/scan` is the product; `/bench` is the latency harness       |
| Admin console  | http://localhost:3000/admin                     | Regulator aggregates, product/baseline status, model versions |
| OEM portal     | http://localhost:3000/oem/login                 | Upload reference photos, watch baseline jobs                  |
| API docs       | http://localhost:8000/api/v1/schema/swagger-ui/ | OpenAPI 3 via drf-spectacular                                 |
| Django console | http://localhost:8000/django-admin/             | Raw data: users, products, model versions, telemetry rows     |

Dev seed accounts (`make up` creates them; they exist only in development):

| Account              | Password      | Can open                                                                  |
| -------------------- | ------------- | ------------------------------------------------------------------------- |
| `admin@example.com`  | `admin12345`  | Everything: admin console, OEM portal (demo manufacturer), Django console |
| `nafdac@example.com` | `nafdac12345` | Admin console (regulator aggregates only)                                 |
| `oem@example.com`    | `oem12345`    | OEM portal, and the admin console without regulator aggregates            |

Camera access needs a secure context: `localhost` works as-is; for a phone on your LAN run
`make https` and open `https://<your-ip>/` (self-signed cert, accept the warning), or use `mkcert`
and drop the files into the `nginx_certs` volume.

## Preloaded products

Seven Nigerian products ship in the catalogue (CWAY Table Water 75cl, Gala Sausage Roll, Minimie
Chinchin, Indomie Chicken 70g, Peak Evaporated Milk 160g, Milo 20g sachet, Emzor Paracetamol 500mg).
They are listed as _reference pending_ and refused by the scanner until reference photos of a genuine
item are uploaded in the OEM portal — see `docs/runbooks/enrol-product.md`.

## Everyday commands

```bash
make api-test  make api-lint            # pytest (Postgres), ruff/black/mypy
make web-test  make web-lint  make web-typecheck  make web-build
make ml-test                            # pairing/leakage, model shape, loss, export parity
make ml-synth ml-manifest               # synthetic dev dataset + versioned manifest
make ml-train-quick                     # CPU-friendly training; make ml-train = thesis config
make ml-export ml-baselines ml-evaluate # TF.js artifact → apps/web/public/models/v1, baselines, report
make e2e                                # Playwright against the dev server (profile e2e)
```

Deploying: backend on Render (`render.yaml`), PWA on Vercel (`apps/web/vercel.json`) — see
`docs/runbooks/deploy-render.md`. Self-hosted alternative with nginx:

```bash
docker compose -f infra/docker-compose.prod.yml --env-file .env up -d --build
```

## Where things are

- Client vision pipeline: `apps/web/lib/vision/` (Python twin: `ml/src/authentic_edge_ml/preprocessing.py`)
- Inference + decision: `apps/web/lib/inference/` (`tf.tidy()` everywhere; see `siamese.ts`)
- Engine worker: `apps/web/lib/scan/engine.worker.ts` + `engineClient.ts` (OpenCV.js/TF.js off the UI thread, ADR-0005)
- Scan state machine: `apps/web/lib/scan/machine.ts` (`idle → capturing → preprocessing → extracting_features → inferring → result | error`)
- Telemetry privacy invariant: `apps/web/lib/telemetry/types.ts` (compile-time `AssertNoBinary`) and `apps/api/telemetry/serializers.py` (runtime allowlist)
- Hyperparameters (single source of truth): `ml/src/authentic_edge_ml/params.py` → embedded in `model.json`
- Evaluation report: `docs/evaluation-report-v1.md` (regenerate with `make ml-evaluate`)

## Measured (v0.1, synthetic dataset)

| Check                                      | Result                                                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Backend tests (pytest, Postgres)           | 44 passed, 89 % coverage                                                                            |
| ML tests (pytest) + `mypy --strict` + ruff | 20 passed, clean                                                                                    |
| Web unit tests (Vitest)                    | 61 passed, 91 % line coverage on the critical libs                                                  |
| Web e2e (Playwright, fake camera, offline) | 3 passed                                                                                            |
| TF.js ↔ Keras numerical parity             | < 1e-3 L2 on the seeded self-test                                                                   |
| Lighthouse `/` (mobile sim)                | PWA 100 · Perf 94 · A11y 100 · Best practices 100                                                   |
| Lighthouse `/scan` (mobile sim)            | PWA 100 · Perf 81 (TBT 80–110 ms, TTI 4.3–4.9 s; the 10 MB OpenCV.js download dominates) · A11y 100 |
| Cached payload                             | 13.8 MB of the 15 MB budget (10 MB is the generic OpenCV.js build)                                  |
| Model artifact                             | 516 KB float16, one shard                                                                           |

## Status against the plan

The bundled model (v1.0.0, 8 epochs on synthetic data) meets the validation gate (recall 0.95 / precision 0.88) but **not** the held-out test/adversarial gates — see `docs/evaluation-report-v1.md`; those gates are expected to be met only with the real Phase 1 dataset and a GPU-length run (`make ml-train`).

Phase 0 (scaffold, compose, placeholder/real model), Phase 3 (end-to-end offline scan flow) and
the backend (§11) are implemented and tested. Phase 1 currently uses a **synthetic** dataset
(`docs/data-quality-v1.md`); Phase 2/4 pipelines run end-to-end on it and are ready for the real
captures. Device-lab latency numbers come from the `/bench` page and are merged into the report
with `authentic-edge-ml evaluate --latency-json`.
