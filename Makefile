.DEFAULT_GOAL:=help

.PHONY: help

help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

update: ## Bumps installed deps.
	@npx npm-check-updates -u && npm install && cd src/template && npx npm-check-updates -u
