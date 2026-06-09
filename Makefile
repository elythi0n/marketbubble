# MarketBubble — Docker image build & GHCR push
#
# Quick start:
#   cp .env.example .env          # set NEXT_PUBLIC_SITE_URL (and secrets for compose)
#   make build                    # build app + relay images locally
#   docker login ghcr.io          # once per machine (PAT with write:packages)
#   make push                     # push to GHCR
#   make release                  # build + push
#
# Overrides:
#   make build TAG=v1.0.0
#   make build REGISTRY=ghcr.io/elythi0n NEXT_PUBLIC_SITE_URL=https://marketbubble.virta.lol
#   make push-app TAG=v1.0.0 && make tag-latest TAG=v1.0.0 && make push TAG=latest

.DEFAULT_GOAL := help

REGISTRY      ?= ghcr.io/elythi0n
APP_IMAGE     ?= $(REGISTRY)/marketbubble
RELAY_IMAGE   ?= $(REGISTRY)/marketbubble-relay
TAG           ?= latest
PLATFORM      ?= linux/amd64

NEXT_PUBLIC_SITE_URL      ?= https://marketbubble.virta.lol
NEXT_PUBLIC_DEMO_DISABLED ?= 0

DOCKER_BUILD_FLAGS ?= --platform $(PLATFORM)

# Load production URL / secrets from .env when present (optional).
-include .env
export

.PHONY: help \
	build build-app build-relay \
	push push-app push-relay \
	release tag-latest login \
	compose-up compose-down compose-logs

help: ## Show targets
	@echo MarketBubble Docker targets:
	@echo.
	@grep -E '^[a-zA-Z0-9_.-]+:.*##' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'
	@echo.
	@echo "Images: $(APP_IMAGE):$(TAG)  $(RELAY_IMAGE):$(TAG)"
	@echo "Build args: NEXT_PUBLIC_SITE_URL=$(NEXT_PUBLIC_SITE_URL) NEXT_PUBLIC_DEMO_DISABLED=$(NEXT_PUBLIC_DEMO_DISABLED)"

build: build-app build-relay ## Build app and relay images

build-app: ## Build Next.js app image
	docker build $(DOCKER_BUILD_FLAGS) \
		--build-arg NEXT_PUBLIC_SITE_URL=$(NEXT_PUBLIC_SITE_URL) \
		--build-arg NEXT_PUBLIC_DEMO_DISABLED=$(NEXT_PUBLIC_DEMO_DISABLED) \
		-t $(APP_IMAGE):$(TAG) \
		-f Dockerfile \
		.

build-relay: ## Build chat relay image
	docker build $(DOCKER_BUILD_FLAGS) \
		-t $(RELAY_IMAGE):$(TAG) \
		-f relay/Dockerfile \
		.

push: push-app push-relay ## Push app and relay images

push-app: ## Push app image
	docker push $(APP_IMAGE):$(TAG)

push-relay: ## Push relay image
	docker push $(RELAY_IMAGE):$(TAG)

release: build push ## Build then push both images

tag-latest: ## Also tag the current TAG as :latest (run before push TAG=latest)
	docker tag $(APP_IMAGE):$(TAG) $(APP_IMAGE):latest
	docker tag $(RELAY_IMAGE):$(TAG) $(RELAY_IMAGE):latest

login: ## Log in to GitHub Container Registry
	@echo "Use a GitHub PAT with write:packages scope."
	docker login ghcr.io

compose-up: ## Run full stack locally (build from source)
	docker compose up --build -d

compose-down: ## Stop local compose stack
	docker compose down

compose-logs: ## Follow compose logs
	docker compose logs -f
