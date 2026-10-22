"""Postgres access: a psycopg pool, dict rows, helpers, the event stream and LISTEN/NOTIFY fan-out."""
from __future__ import annotations
import asyncio, json, uuid
from datetime import datetime, timezone
from typing import Any
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import AsyncConnectionPool
from .config import settings

pool: AsyncConnectionPool | None = None

async def init():
    global pool
    pool = AsyncConnectionPool(settings.database_url, min_size=1, max_size=8, kwargs=dict(row_factory=dict_row, options="-c search_path=strada,public"), open=False)
    await pool.open()

async def close():
    if pool: await pool.close()

def _p(v: Any):
    return Jsonb(v) if isinstance(v, (dict, list)) and not (isinstance(v, list) and all(isinstance(x, str) for x in v)) else v

async def fetch(sql: str, *args) -> list[dict]:
    async with pool.connection() as c:
        cur = await c.execute(sql, args)
        return await cur.fetchall()

async def one(sql: str, *args) -> dict | None:
    rows = await fetch(sql, *args)
    return rows[0] if rows else None

async def execute(sql: str, *args) -> None:
    async with pool.connection() as c:
        await c.execute(sql, args)

async def insert(table: str, row: dict) -> dict:
    cols = ", ".join(row.keys()); ph = ", ".join(["%s"] * len(row))
    return await one(f"insert into {table} ({cols}) values ({ph}) returning *", *[_p(v) for v in row.values()])

async def update(table: str, id_: str, patch: dict) -> dict:
    sets = ", ".join(f"{k} = %s" for k in patch)
    return await one(f"update {table} set {sets} where id = %s returning *", *[_p(v) for v in patch.values()], id_)

def new_id(prefix: str) -> str: return f"{prefix}{uuid.uuid4().hex[:8]}"
def now() -> datetime: return datetime.now(timezone.utc)

async def demo_now() -> datetime:
    s = await one("select value from settings where key = 'demo_clock'")
    off = (s or {}).get("value", {}).get("offset_seconds", 0)
    from datetime import timedelta
    return now() + timedelta(seconds=off)

# ---- events ----
async def emit(type_: str, payload: dict | None = None, source: str = "runtime") -> dict:
    return await insert("events", dict(type=type_, payload=payload or {}, source=source))

async def listen(callback):
    """LISTEN strada_events forever; callback(event_row)"""
    while True:
        try:
            async with await psycopg.AsyncConnection.connect(settings.database_url, autocommit=True, row_factory=dict_row, options="-c search_path=strada,public") as conn:
                await conn.execute("listen strada_events")
                async for n in conn.notifies():
                    try:
                        meta = json.loads(n.payload)
                        row = await one("select * from events where id = %s", meta["id"])
                        if row: await callback(row)
                    except Exception as e:  # keep listening
                        print("event callback error", e)
        except Exception as e:
            print("listen reconnect", e); await asyncio.sleep(2)

import re as _re
def camel(k: str) -> str:
    if k == "from_name": return "from"
    return _re.sub(r"_([a-z])", lambda m: m.group(1).upper(), k)

RAW_BLOBS = {"findings", "incident", "verification", "remedy", "checklist", "package", "tool_calls", "output", "input", "payload", "transcript", "steps", "highlights"}

def jsonable(v, camelize: bool = False):
    """ISO dates everywhere; camelCase only the record's own column names — stored JSON blobs keep their keys (the apps read them as written)."""
    if isinstance(v, datetime): return v.isoformat()
    if isinstance(v, dict): return {(camel(k) if camelize else k): (jsonable(x, False) if camelize and k in RAW_BLOBS else jsonable(x, camelize)) for k, x in v.items()}
    if isinstance(v, list): return [jsonable(x, camelize) for x in v]
    return v
