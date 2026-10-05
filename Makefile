# Convenience wrapper around docker compose. Everything runs inside containers.
COMPOSE ?= docker compose
ML      := $(COMPOSE) --profile ml run --rm ml

.DEFAULT_GOAL := help
help:             ## List the available commands
	@grep -hE '^[a-z0-9-]+:.*##' $(MAKEFILE_LIST) | sed -e 's/:.*##/|/' | awk -F'|' '{printf "  \033[1m%-16s\033[0m %s\n", $$1, $$2}'

.PHONY: help urls docker-ready setup up down logs ps build clean api-shell api-test api-lint web-test web-lint web-typecheck web-build \
        ml-test ml-synth ml-manifest ml-train ml-train-quick ml-finalize ml-export ml-evaluate ml-placeholder ml-baselines ml-all e2e https

setup:            ## First-time setup: .env, pnpm lockfile, images
	./scripts/setup.sh

docker-ready:     ## Start the Colima VM if the Docker daemon is not reachable
	@docker info >/dev/null 2>&1 || { command -v colima >/dev/null 2>&1 && { echo "Docker is not running: starting Colima..."; colima start; } || { echo "Docker is not running. Start Docker Desktop/OrbStack/Colima first."; exit 1; }; }

up: docker-ready  ## Start the dev stack (db, redis, api, worker, web)
	$(COMPOSE) up -d --build
	@$(MAKE) --no-print-directory urls

urls:             ## Print where each service is and the dev sign-ins
	@echo "  Scanner        http://localhost:3000/scan"
	@echo "  Admin console  http://localhost:3000/admin"
	@echo "  OEM portal     http://localhost:3000/oem/login"
	@echo "  API docs       http://localhost:8000/api/v1/schema/swagger-ui/"
	@echo "  Django console http://localhost:8000/django-admin/"
	@echo "  Dev sign-ins   admin@example.com/admin12345 · oem@example.com/oem12345 · nafdac@example.com/nafdac12345"
	@echo "  Phone          run 'make https' first, then https://$(LAN_IP)/scan (camera needs HTTPS)"

down:            ## Stop the stack (keeps the database)
	$(COMPOSE) --profile ml --profile https --profile e2e down

clean:            ## Stop and delete volumes (database, node_modules caches)
	$(COMPOSE) --profile ml --profile https --profile e2e down -v

logs:            ## Follow the logs of every service
	$(COMPOSE) logs -f --tail=100

ps:              ## Show what is running
	$(COMPOSE) ps

build:           ## Rebuild all images
	$(COMPOSE) --profile ml build

LAN_IP := $(shell ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $$1}')
https: docker-ready ## HTTPS front door for phones on the LAN: https://$(LAN_IP)/  (self-signed; accept the warning once)
	@mkdir -p infra/nginx/certs
	@if command -v mkcert >/dev/null 2>&1; then \
	  mkcert -cert-file infra/nginx/certs/fullchain.pem -key-file infra/nginx/certs/privkey.pem localhost 127.0.0.1 $(LAN_IP) >/dev/null 2>&1; \
	else \
	  openssl req -x509 -nodes -newkey rsa:2048 -days 365 -subj "/CN=$(LAN_IP)/O=authentic-edge-dev" \
	    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:$(LAN_IP)" \
	    -keyout infra/nginx/certs/privkey.pem -out infra/nginx/certs/fullchain.pem 2>/dev/null; \
	fi
	$(COMPOSE) --profile https up -d nginx
	@echo "Phone: open https://$(LAN_IP)/scan  (same Wi-Fi; accept the certificate warning)"

# --- Django ---
api-shell:       ## Open a Django shell
	$(COMPOSE) exec api python manage.py shell
api-test:        ## Backend tests (pytest on Postgres)
	$(COMPOSE) run --rm --no-deps -e DJANGO_SETTINGS_MODULE=config.settings.test api sh -c "pytest -q --cov --cov-report=term-missing"
api-lint:        ## Backend lint and type checks
	$(COMPOSE) run --rm --no-deps api sh -c "ruff check . && black --check . && mypy ."

# --- Web ---
web-test:        ## Web unit tests (Vitest)
	$(COMPOSE) run --rm --no-deps web pnpm --filter @authentic-edge/web test
web-lint:        ## Web lint
	$(COMPOSE) run --rm --no-deps web pnpm --filter @authentic-edge/web lint
web-typecheck:   ## Web type checks
	$(COMPOSE) run --rm --no-deps web pnpm --filter @authentic-edge/web typecheck
web-build:       ## Build the static PWA export
	$(COMPOSE) run --rm --no-deps web pnpm --filter @authentic-edge/web build
e2e:             ## Run the browser tests (Playwright)
	$(COMPOSE) --profile e2e run --rm e2e

# --- ML ---
ml-test:         ## ML pipeline tests
	$(ML) pytest -q
ml-synth:         ## Generate the synthetic dev dataset (stands in for Phase 1 captures)
	$(ML) python -m authentic_edge_ml.cli synth --out data/raw/synthetic --categories 2 --per-class 120
ml-manifest:     ## Build a dataset manifest from captures
	$(ML) python -m authentic_edge_ml.cli manifest --raw data/raw/synthetic --out data/manifests/v1.json
ml-train:         ## Full run (thesis config: 50 epochs, early stopping) — GPU recommended
	$(ML) python -m authentic_edge_ml.cli train --config src/authentic_edge_ml/training/config.yaml
ml-train-quick:   ## CPU-friendly dev run (fewer pairs/epochs); same pipeline, same artifacts
	$(ML) python -m authentic_edge_ml.cli train --config src/authentic_edge_ml/training/config.yaml --epochs 12 --max-pairs 1200
ml-finalize:      ## Tune threshold + export embedding.keras from an existing checkpoint
	$(ML) python -m authentic_edge_ml.cli finalize --config src/authentic_edge_ml/training/config.yaml
ml-export:       ## Export the trained model to TensorFlow.js
	$(ML) python -m authentic_edge_ml.cli export --checkpoint artifacts/siamese_best.keras --version 1 --out /out/models
ml-evaluate:     ## Write the evaluation report
	$(ML) python -m authentic_edge_ml.cli evaluate --checkpoint artifacts/siamese_best.keras --manifest data/manifests/v1.json --out /out/docs/evaluation-report-v1.md
ml-baselines:    ## Generate baseline signatures from the dataset
	$(ML) python -m authentic_edge_ml.cli baselines --checkpoint artifacts/siamese_best.keras --manifest data/manifests/v1.json --version 1 --out /out/baselines
ml-placeholder:   ## Random-weight model with the correct I/O shape (Phase 0 unblocker)
	$(ML) python -m authentic_edge_ml.cli placeholder --out /out/models --version 0-placeholder
ml-all: ml-synth ml-manifest ml-train ml-export ml-baselines ml-evaluate          ## Full ML chain: data, train, export, baselines, report
