# Runbook: deploy the backend on Render, the PWA on Vercel

The PWA (Next.js static export) runs on Vercel. Everything else — Django API, Celery worker,
PostgreSQL, Redis — runs on Render from the Blueprint in `render.yaml`. The PWA never calls Render
directly: Vercel proxies `/api`, `/django-admin` and `/django-static` to it (`apps/web/vercel.json`),
so the browser sees a single origin and the session cookies of the OEM portal and admin console
work in every browser, including Safari.

## Why one Render service runs both the API and the worker

The Celery worker reads the reference photos the API saves to disk. Render services cannot share a
disk, so `apps/api/Dockerfile.render` starts gunicorn **and** the Celery worker in the same container
(`apps/api/bin/start-render.sh`). The disk is ephemeral: photos are only needed until the signature
is computed and stored in Postgres, which is fine. The worker loads TensorFlow, so the service needs
the **Standard (2 GB)** plan; Starter (512 MB) is killed on the first baseline job.

## One-time setup

1. Push the repository to GitHub (the Keras checkpoint `ml/artifacts/v1/embedding.keras` is tracked
   on purpose — the worker needs it).
2. Render dashboard → **New → Blueprint** → pick the repo. Render reads `render.yaml` and asks for
   the `sync: false` values:
   - `PUBLIC_WEB_ORIGIN` and `CSRF_TRUSTED_ORIGINS`: your Vercel URL, e.g. `https://authentic-edge.vercel.app`
     (you can fill a placeholder now and correct it after the first Vercel deploy).
   - `CORS_ALLOWED_ORIGINS`: same value (only used if the PWA ever calls Render directly).
   - `BOOTSTRAP_ADMIN_EMAIL/PASSWORD`: your superuser. Optional `BOOTSTRAP_OEM_*` creates the first
     manufacturer account for the OEM portal, `BOOTSTRAP_NAFDAC_*` a regulator account.
     Accounts are created once and never reset by later deploys.
   - `SENTRY_DSN`: leave empty unless you use Sentry.
3. Deploy. The pre-deploy command runs migrations and `bootstrap` (catalogue, model version 1.0.0,
   groups, the accounts above). Health check: `https://<service>.onrender.com/api/v1/health/`.
4. Vercel → **New Project** → same repo:
   - Root Directory: `apps/web` (keep "Include source files outside of the Root Directory" on —
     it is a pnpm workspace).
   - Build Command `pnpm build`, Output Directory `out` (already in `vercel.json`).
   - Environment: leave `NEXT_PUBLIC_API_BASE_URL` **empty** (same-origin via the rewrites).
   - In `apps/web/vercel.json` replace `authentic-edge-api.onrender.com` with your Render service's
     hostname if you named it differently.
5. Open `https://<your-app>.vercel.app/scan` on a phone: HTTPS is automatic, so the camera works.

## Day to day

- `git push` redeploys both: Render only when `apps/api/`, `ml/src/`, `ml/artifacts/` or
  `render.yaml` change; Vercel on any push.
- Logs: Render service → Logs (API and worker lines are interleaved; worker lines say `celery`).
- Django console: `https://<your-app>.vercel.app/django-admin/`.
- Enrol products: `docs/runbooks/enrol-product.md` — identical to local, at the Vercel URL.
- Model release: ship the new `apps/web/public/models/vN/` with the PWA, add the `ModelVersion`
  row in the Django console, flip `is_active`; clients refresh on next launch (`docs/runbooks/rollback.md`).

## Limits to know

- Free Postgres is deleted after 30 days; move to `basic-256mb` (`render.yaml`, `databases.plan`)
  for anything you need to keep.
- Reference photos uploaded to the OEM portal survive only until the next deploy or restart; the
  signatures computed from them live in Postgres and are unaffected.
- The telemetry endpoint is public and rate-limited (60/min per IP by default, `TELEMETRY_RATE_LIMIT`).
