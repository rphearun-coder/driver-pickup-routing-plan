.PHONY: help install dev build deploy tail login logout clean push

help:
	@echo "Available targets:"
	@echo "  make install   - install dependencies"
	@echo "  make dev       - run local dev server (wrangler dev)"
	@echo "  make build     - build the project"
	@echo "  make deploy    - deploy to Cloudflare (wrangler deploy)"
	@echo "  make tail      - stream live logs from the deployed worker"
	@echo "  make login     - authenticate wrangler with Cloudflare"
	@echo "  make logout    - log wrangler out of Cloudflare"
	@echo "  make clean     - remove node_modules, dist, and .wrangler cache"
	@echo "  make push msg='commit message' - git add, commit, and push to origin main"

install:
	npm install

dev:
	npx wrangler dev

build:
	npm run build

deploy:
	npx wrangler deploy

tail:
	npx wrangler tail

login:
	npx wrangler login

logout:
	npx wrangler logout

clean:
	rm -rf node_modules dist .wrangler

push:
	git add .
	git commit -m "$(msg)"
	git push origin main
