SHELL := /bin/bash
PG_BIN ?= $(shell ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)
PG_DIR := $(CURDIR)/.pg
LOCAL_DSN := postgresql://postgres@/strada?host=/tmp&port=5433

.PHONY: help db db-stop seed strada-sys runtime workspace strada-pay voice-agent e2e install up down status

help:
	@echo "make install    install Python and Node dependencies"
	@echo "make db         start local Postgres 16 on :5433 with the strada schema and seed"
	@echo "make seed       re-seed (reset the demo day) on DATABASE_URL or the local db"
	@echo "make strada-sys run the Strada systems mock on :8081"
	@echo "make runtime    run the agent runtime on :8080"
	@echo "make workspace  run the Copilot Service workspace on :5173"
	@echo "make strada-pay run the employee app (chat + voice) on :5174"
	@echo "make voice-agent create/update the ElevenLabs voice agent (needs ELEVENLABS_API_KEY in .env)"
	@echo "make up/down/status  start or stop Postgres + strada-sys + runtime in the background"
	@echo "make e2e        Playwright: employee chat → transfer → representative → wrap-up → close"

install:
	pip install -r services/runtime/requirements.txt -r services/strada-sys/requirements.txt
	cd apps/workspace && npm install
	cd apps/strada-pay && npm install

db:
	@test -d $(PG_DIR)/data || $(PG_BIN)/initdb -D $(PG_DIR)/data -U postgres --auth=trust >/dev/null
	@$(PG_BIN)/pg_ctl -D $(PG_DIR)/data -l $(PG_DIR)/log -o "-p 5433 -k /tmp" start >/dev/null || true
	@sleep 1; psql -h /tmp -p 5433 -U postgres -tc "select 1 from pg_database where datname='strada'" | grep -q 1 || psql -h /tmp -p 5433 -U postgres -c "create database strada"
	for f in packages/schema/migrations/*.sql; do psql -h /tmp -p 5433 -U postgres -d strada -q -f $$f; done
	python3 packages/schema/seed.py --dsn "$(LOCAL_DSN)"

db-stop:
	$(PG_BIN)/pg_ctl -D $(PG_DIR)/data stop

seed:
	python3 packages/schema/seed.py --dsn "$${DATABASE_URL:-$(LOCAL_DSN)}"

strada-sys:
	cd services/strada-sys && uvicorn app.main:app --port 8081 --reload

runtime:
	cd services/runtime && uvicorn app.main:app --port 8080 --reload

workspace:
	cd apps/workspace && npm run dev

strada-pay:
	cd apps/strada-pay && npm run dev

voice-agent:
	pip install -q elevenlabs && python3 scripts/elevenlabs_agent.py

up:
	scripts/dev.sh up
down:
	scripts/dev.sh down
status:
	scripts/dev.sh status

e2e:
	cd apps/workspace && node ../../scripts/e2e.mjs
