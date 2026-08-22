.PHONY: dev test smoke up down up-spiderfoot logs

dev:
	ENGINE_MODE=mock npm run dev

test:
	npm test

smoke:
	npm run smoke

up:
	docker compose up -d --build

up-spiderfoot:
	docker compose --profile spiderfoot up -d --build

down:
	docker compose down

logs:
	docker compose logs -f --tail=200
