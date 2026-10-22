"""Shared agent contract: every agent runs inside an AgentRun that logs to strada.agent_runs and streams steps to the apps."""
from __future__ import annotations
import json, traceback
from typing import Any
from .. import db
from ..bus import hub

class AgentRun:
    def __init__(self, agent: str, trigger: str, subject_type: str | None = None, subject_id: str | None = None, input: dict | None = None):
        self.agent, self.trigger, self.subject_type, self.subject_id, self.input = agent, trigger, subject_type, subject_id, input or {}
        self.id: int | None = None
        self.tool_calls: list[dict] = []
        self.output: dict = {}
        self.waiting: str | None = None

    async def __aenter__(self):
        row = await db.insert("agent_runs", dict(agent=self.agent, trigger=self.trigger, subject_type=self.subject_type, subject_id=self.subject_id, input=db.jsonable(self.input)))
        self.id = row["id"]
        await hub.broadcast("agent.started", dict(run_id=self.id, agent=self.agent, subject_type=self.subject_type, subject_id=self.subject_id))
        return self

    async def step(self, name: str, detail: str = ""):
        await hub.broadcast("agent.step", dict(run_id=self.id, agent=self.agent, subject_type=self.subject_type, subject_id=self.subject_id, step=name, detail=detail))

    async def tool(self, name: str, args: dict, result: Any):
        rec = dict(tool=name, args=db.jsonable(args), result=db.jsonable(_trim(result)))
        self.tool_calls.append(rec)
        await db.execute("update agent_runs set tool_calls = %s where id = %s", json.dumps(self.tool_calls, default=str), self.id)
        await hub.broadcast("agent.tool", dict(run_id=self.id, agent=self.agent, subject_id=self.subject_id, **rec))

    async def wait(self, reason: str):
        self.waiting = reason
        await db.execute("update agent_runs set status = 'waiting', output = %s where id = %s", json.dumps(dict(waiting_for=reason)), self.id)
        await hub.broadcast("agent.waiting", dict(run_id=self.id, agent=self.agent, subject_id=self.subject_id, reason=reason))

    async def __aexit__(self, exc_type, exc, tb):
        if exc:
            await db.execute("update agent_runs set status = 'failed', error = %s, finished_at = now() where id = %s", "".join(traceback.format_exception_only(exc_type, exc)), self.id)
            await hub.broadcast("agent.failed", dict(run_id=self.id, agent=self.agent, subject_id=self.subject_id, error=str(exc)))
            return False
        status = "waiting" if self.waiting else "done"
        await db.execute("update agent_runs set status = %s, output = %s, finished_at = now() where id = %s", status, json.dumps(db.jsonable(dict(self.output, waiting_for=self.waiting) if self.waiting else self.output), default=str), self.id)
        await hub.broadcast("agent.done", dict(run_id=self.id, agent=self.agent, subject_type=self.subject_type, subject_id=self.subject_id, output=dict(self.output, waiting_for=self.waiting) if self.waiting else self.output))
        return False

def _trim(v: Any, n: int = 4000):
    s = json.dumps(v, default=str)
    return v if len(s) <= n else dict(truncated=s[:n])

# ---- helpers shared by agents ----
async def post(case_id: str, agent: str, subject: str, body: str, type_: str = "autopost") -> dict:
    row = await db.insert("activities", dict(id=db.new_id("t"), case_id=case_id, type=type_, from_name=agent, subject=subject, body=body, ai_generated=True, agent=agent))
    await hub.broadcast("activity.created", row)
    return row

async def case_changed(case_id: str):
    row = await db.one("select * from cases where id = %s", case_id)
    await hub.broadcast("case.updated", row)
    return row
