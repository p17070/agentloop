.PHONY: install build typecheck test test-ci test-coverage test-integration lint clean ci help

# ─── Setup ────────────────────────────────────────────────────────────────────

install: ## Install dependencies
	npm ci

# ─── Build ────────────────────────────────────────────────────────────────────

build: ## Build the package (ESM + CJS)
	npx tsup

clean: ## Remove build artifacts
	rm -rf dist

# ─── Quality ──────────────────────────────────────────────────────────────────

typecheck: ## Run TypeScript type checking
	npx tsc --noEmit

test: ## Run unit tests in watch mode
	npx vitest

test-ci: ## Run unit tests once (CI mode)
	npx vitest run

test-coverage: ## Run unit tests with coverage report
	npx vitest run --coverage

test-integration: ## Run integration tests (requires API keys)
	npx vitest run --config vitest.integration.config.ts

test-integration-anthropic: ## Run Anthropic integration tests only
	npx vitest run --config vitest.integration.config.ts tests/integration/anthropic.test.ts

test-integration-gemini: ## Run Gemini integration tests only
	npx vitest run --config vitest.integration.config.ts tests/integration/gemini.test.ts

# ─── Workflows ────────────────────────────────────────────────────────────────

ci: typecheck test-ci build ## Full CI pipeline (typecheck → test → build)

# ─── Help ─────────────────────────────────────────────────────────────────────

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-28s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
