# ADR-0001: Monorepo structure and toolchains

**Status:** Accepted · **Date:** 2026-09-18

## Context

The system has three codebases with different toolchains: a Next.js PWA (TypeScript), a Django
administrative backend (Python) and a model-training pipeline (Python + TensorFlow). They share
contracts (API payloads, model metadata, hyperparameters) that must not drift.

## Decision

- One repository, `pnpm` workspaces for JS (`apps/web`, `packages/shared-types`), independent
  Python projects for `apps/api` (pip requirements) and `ml/` (PEP 621 `pyproject.toml`).
- Everything runs through Docker Compose: `infra/docker-compose.yml` is canonical; the root
  `compose.yaml` includes it so `docker compose up` works from the repo root.
- The ML code lives in an importable package `authentic_edge_ml` (`ml/src/authentic_edge_ml/…`)
  rather than bare top-level packages (`models`, `training`) as sketched in the plan — a top-level
  `models` package collides with Django's `<app>.models` modules once the Celery worker installs the
  ML package (plan §11.5).
- Hyperparameters have one source of truth: `ml/src/authentic_edge_ml/params.py`. They are embedded
  into the exported `model.json` (`userDefinedMetadata`) and read by the client at runtime; the
  TypeScript defaults in `apps/web/lib/vision/params.ts` exist only for cold start.
- The Celery worker image installs `ml/` (TensorFlow) so baseline embeddings reuse the exact
  preprocessing/ORB/embedding code used in training. The `api` image stays lean (no TF).

## Consequences

- A single `make setup` brings up the full stack including a trained model.
- CI runs three workflows (web / api / ml) so lint+test stays fast per app.
- Poetry (plan §4) is replaced by plain `pyproject.toml` + pip inside Docker; a Poetry lockfile can
  be added later without changing the layout.
