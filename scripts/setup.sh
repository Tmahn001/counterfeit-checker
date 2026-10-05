#!/usr/bin/env bash
# One-shot developer setup: creates .env, builds images, starts the stack, produces a model if none exists.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required (Docker Desktop, OrbStack or Colima)." >&2
  exit 1
fi

[ -f .env ] || { cp .env.example .env; echo "created .env from .env.example"; }

echo "==> building images"
docker compose --profile ml build

echo "==> starting db/redis/api/worker/web"
docker compose up -d

if [ ! -f apps/web/public/models/v1/model.json ]; then
  echo "==> no model found — generating synthetic data, training a small model, exporting to TF.js"
  make ml-synth ml-manifest ml-train ml-export ml-baselines ml-evaluate
fi

echo
echo "web:   http://localhost:3000"
echo "api:   http://localhost:8000/api/v1/schema/swagger-ui/"
echo "admin: http://localhost:8000/admin/  (admin@example.com / admin12345)"
