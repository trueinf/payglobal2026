#!/usr/bin/env bash
# Start / stop the local stack: Postgres (:5433), strada-sys (:8081), runtime (:8080).
# usage: scripts/dev.sh up | down | status | logs
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="${STRADA_LOG_DIR:-/tmp}"
PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)}"
PG_AS="${PG_AS:-}"   # set to a user name when running as root (postgres refuses root)

pg() { if [ -n "$PG_AS" ]; then su "$PG_AS" -c "$*"; else bash -c "$*"; fi; }

case "${1:-status}" in
  up)
    [ -d "$ROOT/.pg/data" ] || pg "$PG_BIN/initdb -D $ROOT/.pg/data -U postgres --auth=trust >/dev/null"
    pg "$PG_BIN/pg_ctl -D $ROOT/.pg/data -l $ROOT/.pg/log -o '-p 5433 -k /tmp' start" >/dev/null 2>&1 || true
    sleep 1
    (cd "$ROOT/services/strada-sys" && setsid nohup uvicorn app.main:app --port 8081 > "$LOG/strada-sys.log" 2>&1 < /dev/null &)
    (cd "$ROOT/services/runtime"    && setsid nohup uvicorn app.main:app --port 8080 > "$LOG/runtime.log"    2>&1 < /dev/null &)
    sleep 4; "$0" status ;;
  down)
    pkill -f "uvicorn app.main:app --port 808[01]" 2>/dev/null
    pg "$PG_BIN/pg_ctl -D $ROOT/.pg/data stop" >/dev/null 2>&1 || true ;;
  status)
    echo -n "postgres:   "; psql -h /tmp -p 5433 -U postgres -d strada -tAc "select count(*)||' cases' from strada.cases" 2>/dev/null || echo down
    echo -n "strada-sys: "; curl -s -m 3 localhost:8081/health || echo down; echo
    echo -n "runtime:    "; curl -s -m 3 localhost:8080/health || echo down; echo ;;
  logs) tail -n 40 "$LOG/runtime.log" "$LOG/strada-sys.log" ;;
esac
