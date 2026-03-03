COMPOSE = docker compose

.PHONY: up up-rebuild down down-backend up-backend up-backend-rebuild backend-generate backend-dev backend-prod backend-test smoke-http

up:
	$(COMPOSE) up -d

up-rebuild:
	$(COMPOSE) build --no-cache
	$(COMPOSE) up -d --force-recreate

down:
	$(COMPOSE) down

down-backend:
	$(COMPOSE) stop backend

up-backend:
	$(COMPOSE) up -d backend

up-backend-rebuild:
	$(COMPOSE) build --no-cache backend
	$(COMPOSE) up -d --force-recreate backend

backend-generate:
	./scripts/backend/generate_models.sh

backend-dev:
	./scripts/backend/run-dev.sh

backend-prod:
	./scripts/backend/run-prod.sh

backend-test:
	PYTHONPATH=backend uv run --project backend --extra dev pytest backend/tests

smoke-http:
	./scripts/smoke_http.sh
