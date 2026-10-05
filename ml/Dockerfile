# syntax=docker/dockerfile:1.7
# ML toolbox image: training, TF.js export, evaluation. Build context is the repo root.
FROM python:3.11-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_DEFAULT_TIMEOUT=120 PIP_RETRIES=10 \
    TF_CPP_MIN_LOG_LEVEL=2 MPLBACKEND=Agg
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 git && rm -rf /var/lib/apt/lists/*
WORKDIR /ml
COPY ml/pyproject.toml ml/README.md ./
COPY ml/src ./src
RUN pip install -e ".[dev]"
COPY ml/tests ./tests
CMD ["python", "-m", "authentic_edge_ml.cli", "--help"]
