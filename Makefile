.PHONY: compose-up compose-down compose-logs smoke

compose-up:
	docker compose up -d --build

compose-down:
	docker compose down -v

compose-logs:
	docker compose logs -f

smoke:
	./scripts/smoke-compose.sh
