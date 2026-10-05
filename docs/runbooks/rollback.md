# Runbook: rollback

## Model rollback (independent of the app)

1. In Django console (`/django-admin/`) → Model registry, select the previous `ModelVersion` and run
   "Activate selected version". `/api/v1/models/latest/` now returns it.
2. Clients pick up the change on next launch with connectivity (`loadEmbeddingModel` compares
   `modelVersion`/`weightsSha256` against the cached copy and re-downloads).
3. Keep the previous `apps/web/public/models/v{N-1}/` directory deployed — version directories are
   immutable and cache-first, so never overwrite one in place.

## App rollback

```bash
git checkout <previous-tag>
docker compose -f infra/docker-compose.prod.yml --env-file .env up -d --build web
```

The service worker for the previous build re-installs; users see the "Update" prompt on next visit.

## Database

Migrations are forward-only in production. To roll back a migration that shipped with a bad
release: `docker compose exec api python manage.py migrate <app> <previous_migration>` after
confirming the migration is reversible (`sqlmigrate` and review). Take a `pg_dump` first.
