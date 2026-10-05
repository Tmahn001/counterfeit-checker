# syntax=docker/dockerfile:1.7
# Build context is the repository root (pnpm workspace).
FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@9.15.9
WORKDIR /repo

# --- dev: dependencies installed in the image, source bind-mounted by compose ---
FROM base AS dev
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/
COPY packages/shared-types/package.json packages/shared-types/
RUN pnpm install --frozen-lockfile
COPY . .
EXPOSE 3000
CMD ["pnpm", "--filter", "@authentic-edge/web", "dev"]

# --- builder: static export + service worker ---
FROM dev AS builder
ARG NEXT_PUBLIC_API_BASE_URL=/api
ARG NEXT_PUBLIC_MODEL_MANIFEST_URL=/models/v1/model.json
ARG NEXT_PUBLIC_BASELINES_URL=/baselines/v1/baselines.json
ARG NEXT_PUBLIC_SENTRY_DSN=
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_PUBLIC_MODEL_MANIFEST_URL=$NEXT_PUBLIC_MODEL_MANIFEST_URL \
    NEXT_PUBLIC_BASELINES_URL=$NEXT_PUBLIC_BASELINES_URL \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
RUN pnpm --filter @authentic-edge/web build

# --- prod: nginx serving the export with the hardened config ---
FROM nginx:1.27-alpine AS prod
COPY infra/nginx/prod.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/apps/web/out /usr/share/nginx/html
EXPOSE 80 443
