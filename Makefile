.PHONY: bootstrap dev api web test lint db-start db-reset

bootstrap:
	corepack enable
	pnpm install

dev:
	docker compose up -d api worker
	pnpm dev

api:
	docker compose up api worker

web:
	pnpm dev

test:
	docker compose run --rm api pytest
	pnpm test

lint:
	docker compose run --rm api sh -c "ruff check . && mypy app"
	pnpm lint
	pnpm typecheck

db-start:
	supabase start

db-reset:
	supabase db reset
