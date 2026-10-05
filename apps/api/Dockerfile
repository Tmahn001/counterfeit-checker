# syntax=docker/dockerfile:1.7
# Build context is the repository root (see infra/docker-compose.yml) so the worker target can install ml/.
FROM python:3.11-slim-bookworm AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_DEFAULT_TIMEOUT=120 PIP_RETRIES=10
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libpq5 curl && rm -rf /var/lib/apt/lists/*
COPY apps/api/requirements/base.txt /tmp/requirements/base.txt
RUN pip install -r /tmp/requirements/base.txt

# --- dev: runserver + test/lint tooling, source is bind-mounted ---
FROM base AS dev
COPY apps/api/requirements/dev.txt /tmp/requirements/dev.txt
RUN pip install -r /tmp/requirements/dev.txt
COPY apps/api/ /app/
EXPOSE 8000
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]

# --- worker: Celery + the ml package (TensorFlow) for baseline embedding jobs ---
FROM base AS worker
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
# Dependencies first (TensorFlow is large): this layer only rebuilds when pyproject.toml changes.
COPY ml/pyproject.toml ml/README.md /ml/
RUN python -c "import tomllib; print(chr(10).join(tomllib.load(open('/ml/pyproject.toml','rb'))['project']['dependencies']))" > /tmp/ml-requirements.txt \
  && pip install -r /tmp/ml-requirements.txt
COPY ml/src /ml/src
RUN pip install --no-deps /ml
COPY apps/api/requirements/dev.txt /tmp/requirements/dev.txt
RUN pip install -r /tmp/requirements/dev.txt
COPY apps/api/ /app/
CMD ["celery", "-A", "config", "worker", "--loglevel=INFO"]

# --- prod: gunicorn, non-root ---
FROM base AS prod
COPY apps/api/ /app/
RUN addgroup --system app && adduser --system --ingroup app app \
  && mkdir -p /app/media /app/staticfiles && chown -R app:app /app
USER app
EXPOSE 8000
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3"]
