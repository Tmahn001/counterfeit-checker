#!/bin/bash
# Render runs the API and the Celery worker in ONE service: the worker reads the reference photos the
# API writes to local disk, and Render services do not share disks. If either process dies the
# container exits and Render restarts it.
set -euo pipefail

celery -A config worker --loglevel=INFO --concurrency=1 --max-memory-per-child=1200000 &
gunicorn config.wsgi:application \
  --bind "0.0.0.0:${PORT:-8000}" --workers "${WEB_CONCURRENCY:-2}" --timeout 120 \
  --access-logfile - --error-logfile - &

wait -n
echo "a process exited; stopping the service so the platform restarts it" >&2
exit 1
