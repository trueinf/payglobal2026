"""Strada agent runtime — REST + WebSocket for the apps, event stream, agents."""
from __future__ import annotations
import asyncio, json, re
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Any
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from . import db, llm
from .bus import hub
from .config import settings
from .strada import strada
from .agents import case_management as cm
from .agents.base import post, case_changed
from . import pay as pay_routes

def camel(k: str) -> str:
    if k == "from_name": return "from"
    return re.sub(r"_([a-z])", lambda m: m.group(1).upper(), k)
def ser(row: dict | None) -> dict | None:
    if row is None: return None
    return {camel(k): (v.isoformat() if isinstance(v, datetime) else v) for k, v in row.items()}
def ser_all(rows: list[dict]) -> list[dict]: return [ser(r) for r in rows]
def snake(k: str) -> str:
    if k == "from": return "from_name"
    return re.sub(r"([A-Z])", lambda m: "_" + m.group(1).lower(), k)

from .agents import sentinel, incident_clustering, day7, variance, tax_rules, referral, order_reader, quality, client_insight, customer_intent
EVENT_AGENTS = [sentinel, incident_clustering, day7, quality]
CASE_AGENTS = {"variance": (variance, variance.INTENTS), "rules": (tax_rules, tax_rules.INTENTS), "order": (order_reader, order_reader.INTENTS)}

async def _case_agents_on_create(ev: dict):
    """Agents that work on a case the moment it exists, by intent."""
    p = ev["payload"]
    for key, (mod, intents) in CASE_AGENTS.items():
        if p.get("intent") in intents and p.get("case_id"):
            try: await mod.run(p["case_id"], trigger="event")
            except Exception as e: import traceback; traceback.print_exc(); print(f"[{mod.AGENT}] failed: {e}")

async def _run_agent(agent, ev: dict):
    try:
        await agent.handle(ev)
        await db.execute("update events set processed_by = array_append(processed_by, %s) where id = %s", agent.AGENT, ev["id"])
    except Exception as e:
        import traceback; traceback.print_exc()
        print(f"[{agent.AGENT}] failed on {ev['type']}: {e}")

async def dispatch_event(ev: dict):
    """fan-out to apps, then let the event-driven agents react"""
    await hub.broadcast("event", ev)
    for agent in EVENT_AGENTS:
        if ev["type"] in agent.HANDLES:
            asyncio.create_task(_run_agent(agent, ev))
    if ev["type"] == "case.created": asyncio.create_task(_case_agents_on_create(ev))

@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.init()
    if settings.migrate_on_start: await db.migrate()
    task = asyncio.create_task(db.listen(dispatch_event))
    yield
    task.cancel(); await db.close()

app = FastAPI(title="Strada runtime", version="0.1", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in settings.cors_origins.split(",")] if settings.cors_origins != "*" else ["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(pay_routes.router)

@app.middleware("http")
async def demo_guard(request, call_next):
    """Hosted demos: /demo/* mutations need the shared secret (DEMO_SECRET) so nobody resets the day mid-pitch. Unset locally."""
    if settings.demo_secret and request.url.path.startswith("/demo/") and request.method != "GET" and request.headers.get("x-demo-secret") != settings.demo_secret:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=401, content=dict(detail="demo secret required"))
    return await call_next(request)

@app.exception_handler(ValueError)
async def value_error(_, e: ValueError):
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=422, content=dict(detail=str(e)))

@app.get("/health")
async def health():
    n = await db.one("select count(*) as n from cases")
    return dict(ok=True, cases=n["n"], llm="claude" if llm.available() else "rules-fallback", strada_sys=settings.strada_sys_url)

# ---------- bootstrap ----------
@app.get("/bootstrap")
async def bootstrap():
    return dict(
        accounts=ser_all(await db.fetch("select * from accounts order by name")),
        contacts=ser_all(await db.fetch("select * from contacts order by name")),
        queues=ser_all(await db.fetch("select * from queues order by id")),
        cases=ser_all(await db.fetch("select * from cases order by modified_on desc")),
        activities=ser_all(await db.fetch("select * from activities order by modified_at desc")),
        articles=ser_all(await db.fetch("select * from knowledge_articles order by modified desc")),
        scripts=ser_all(await db.fetch("select * from agent_scripts order by id")),
        conversations=ser_all(await db.fetch("select * from conversations order by started_at desc")),
        alerts=ser_all(await db.fetch("select * from alerts order by sent_at desc limit 50")),
        referrals=ser_all(await db.fetch("select * from referrals order by updated_at desc")),
        insights=ser_all(await db.fetch("select distinct on (account_id) * from client_insights order by account_id, created_at desc")),
        intents=((await db.one("select value from settings where key = 'intents'")) or {}).get("value"),
        owner=settings.owner, llm="claude" if llm.available() else "rules-fallback",
    )

# ---------- cases ----------
class CasePatch(BaseModel):
    model_config = dict(extra="allow")

@app.patch("/cases/{case_id}")
async def patch_case(case_id: str, body: CasePatch):
    patch = {snake(k): v for k, v in body.model_dump().items()}
    for k in ("escalated_on", "follow_up_by", "first_response_by", "resolve_by"):
        if k in patch and isinstance(patch[k], str): patch[k] = datetime.fromisoformat(patch[k].replace("Z", "+00:00"))
    if not patch: raise HTTPException(422, "empty patch")
    row = await db.update("cases", case_id, patch)
    await hub.broadcast("case.updated", row)
    return ser(row)

class NewCase(BaseModel):
    title: str; customerId: str; priority: str = "Normal"; origin: str = "Phone"; queueId: str = "q2"; description: str = ""

@app.post("/cases")
async def create_case(c: NewCase):
    import random
    contact = await db.one("select * from contacts where id = %s", c.customerId)
    q = await db.one("select * from queues where id = %s", c.queueId)
    cid = db.new_id("k")
    row = await db.insert("cases", dict(id=cid, number=f"CAS-{random.randint(10500,10999)}-{cid[-4:].upper()}", title=c.title, customer_id=contact["id"], account_id=contact["account_id"], subject=q["name"], priority=c.priority, origin=c.origin, type="Question", product="US Payroll", description=c.description, owner=settings.owner, queue_id=c.queueId, intent="Unclassified", summary=f"{contact['name']} contacted Strada Payroll Support by {c.origin.lower()}. {c.description or 'No further details recorded yet.'}", highlights=["Case created manually by " + settings.owner], resolve_by=(await db.demo_now()) + timedelta(days=2)))
    await post(cid, "System", "Case created", f"{settings.owner} created the case.")
    await db.emit("case.created", dict(case_id=cid, intent="Unclassified", contact_id=contact["id"], account_id=contact["account_id"], source="manual"))
    await hub.broadcast("case.updated", row)
    return ser(row)

class Resolve(BaseModel):
    resolution: str = "Problem Solved"; remarks: str = ""; billableMinutes: int = 0

@app.post("/cases/{case_id}/resolve")
async def resolve_case(case_id: str, r: Resolve):
    case = await db.one("select * from cases where id = %s", case_id)
    if not case: raise HTTPException(404)
    row = await db.update("cases", case_id, dict(status="Resolved", resolution=r.resolution, resolved_on=db.now()))
    await db.insert("activities", dict(id=db.new_id("t"), case_id=case_id, type="autopost", from_name=settings.owner, subject=f"Case resolved: {r.resolution}", body=f"Resolution: {r.resolution}. Billable time: {r.billableMinutes} min. {r.remarks}".strip()))
    await db.emit("case.resolved", dict(case_id=case_id, intent=case["intent"], contact_id=case["customer_id"], account_id=case["account_id"], resolution=r.resolution, remarks=r.remarks))
    await hub.broadcast("case.updated", row)
    # Knowledge Management Agent drafts an article (phase 0: inline, synchronous behaviour)
    from .agents import knowledge_management as km
    asyncio.create_task(km.draft_from_case(case_id))
    return ser(row)

@app.post("/cases/{case_id}/accept-suggestions")
async def accept(case_id: str): return ser(await cm.accept_suggestions(case_id))

@app.post("/cases/{case_id}/route")
async def route(case_id: str):
    case = await db.one("select c.*, q.name as queue_name from cases c left join queues q on q.id = c.queue_id where c.id = %s", case_id)
    await post(case_id, "Unified routing", f"Case routed to {case['queue_name']}", f"Routed by rule: Payroll – intent to queue. Assigned to {settings.owner}.")
    await db.emit("case.routed", dict(case_id=case_id, queue_id=case["queue_id"]))
    return ser(await case_changed(case_id))

@app.post("/cases/{case_id}/agents/{agent}")
async def run_case_agent(case_id: str, agent: str):
    if agent not in CASE_AGENTS: raise HTTPException(404, "unknown agent")
    mod = CASE_AGENTS[agent][0]
    out = await mod.run(case_id, trigger="manual")
    return dict(agent=mod.AGENT, finding=db.jsonable(out) if out else None)

class ReferralReq(BaseModel):
    requestType: str | None = None; extra: dict = {}; submit: bool = False

@app.post("/cases/{case_id}/referral")
async def refer(case_id: str, r: ReferralReq):
    row = await referral.prepare(case_id, r.requestType, r.extra, r.submit, trigger="manual")
    return ser(row)

@app.get("/cases/{case_id}/referrals")
async def referrals_for(case_id: str): return ser_all(await db.fetch("select * from referrals where case_id = %s order by updated_at desc", case_id))

@app.post("/accounts/{account_id}/insight")
async def account_insight(account_id: str, days: int = 14):
    out = await client_insight.run(account_id, days, trigger="manual")
    if out is None: raise HTTPException(404)
    return out

@app.get("/accounts/{account_id}/insights")
async def account_insights(account_id: str): return ser_all(await db.fetch("select * from client_insights where account_id = %s order by created_at desc limit 5", account_id))

@app.post("/intents/discover")
async def intents_discover(days: int = 14): return await customer_intent.discover(days, trigger="manual")

@app.post("/conversations/{conv_id}/evaluate")
async def conv_evaluate(conv_id: str):
    out = await quality.evaluate(conv_id)
    return out or {}

@app.get("/cases/{case_id}/agent-runs")
async def runs_for(case_id: str):
    rows = await db.fetch("select * from agent_runs where subject_id = %s or (subject_type = 'contact' and output->>'case_id' = %s) order by started_at desc limit 20", case_id, case_id)
    return ser_all(rows)

# ---------- activities ----------
class NewActivity(BaseModel):
    model_config = dict(extra="allow")
    caseId: str; type: str; subject: str

@app.post("/activities")
async def create_activity(a: NewActivity):
    d = {snake(k): v for k, v in a.model_dump().items()}
    d.setdefault("from_name", settings.owner)
    if "due" in d and isinstance(d["due"], str): d["due"] = datetime.fromisoformat(d["due"].replace("Z", "+00:00"))
    d["id"] = db.new_id("t")
    row = await db.insert("activities", d)
    await hub.broadcast("activity.created", row)
    if d["type"] == "email" and d.get("direction") == "out":
        await db.update("cases", d["case_id"], dict(first_response_sent=True)); await case_changed(d["case_id"])
    return ser(row)

@app.patch("/activities/{activity_id}")
async def patch_activity(activity_id: str, body: CasePatch):
    patch = {snake(k): v for k, v in body.model_dump().items()}
    patch["modified_at"] = db.now()
    row = await db.update("activities", activity_id, patch)
    await hub.broadcast("activity.updated", row)
    return ser(row)

# ---------- knowledge ----------
@app.patch("/articles/{article_id}")
async def patch_article(article_id: str, body: CasePatch):
    patch = {snake(k): v for k, v in body.model_dump().items()}
    if patch.get("status") == "Published": patch["modified"] = db.now()
    row = await db.update("knowledge_articles", article_id, patch)
    await hub.broadcast("article.updated", row)
    if patch.get("status") == "Published": await db.emit("article.published", dict(article_id=article_id))
    return ser(row)

# ---------- intake (what the channels call) ----------
class Intake(BaseModel):
    contactId: str; text: str; subject: str = ""; conversationId: str | None = None

@app.post("/intake/{source}")
async def intake(source: str, i: Intake):
    if source not in ("chat", "email", "voice"): raise HTTPException(422)
    case = await cm.create_from(source, i.contactId, i.text, i.subject, i.conversationId)
    return ser(case)

# ---------- conversations ----------
@app.post("/conversations/{conv_id}/accept")
async def conv_accept(conv_id: str):
    conv = await db.one("select * from conversations where id = %s", conv_id)
    if not conv: raise HTTPException(404)
    waiting = int((db.now() - conv["started_at"]).total_seconds())
    row = await db.update("conversations", conv_id, dict(state="Active", accepted_at=db.now(), waiting_seconds=waiting, assigned_to=settings.owner))
    await hub.broadcast("conversation.updated", row); return ser(row)

@app.patch("/conversations/{conv_id}")
async def conv_patch(conv_id: str, body: CasePatch):
    patch = {snake(k): v for k, v in body.model_dump().items() if snake(k) in ("disposition_code", "notes", "sentiment", "recording", "summary")}
    if not patch: raise HTTPException(422, "nothing to update")
    row = await db.update("conversations", conv_id, patch)
    await hub.broadcast("conversation.updated", row); return ser(row)

@app.post("/conversations/{conv_id}/reopen")
async def conv_reopen(conv_id: str):
    """Demo helper (Ctrl/Cmd+Shift+I in the workspace): put a conversation back in the queue as if just transferred."""
    row = await db.update("conversations", conv_id, dict(state="Open", accepted_at=None, ended_at=None, closed_at=None, disposition_code=None, assigned_to=None, started_at=db.now(), waiting_seconds=0))
    await hub.broadcast("conversation.updated", row); return ser(row)

class Line(BaseModel):
    who: str; text: str

@app.post("/conversations/{conv_id}/lines")
async def conv_line(conv_id: str, l: Line):
    row = await db.insert("transcript_lines", dict(conversation_id=conv_id, who=l.who, text=l.text))
    await hub.broadcast("transcript.line", row)
    conv = await db.one("select channel from conversations where id = %s", conv_id)
    if l.who == "Representative" and conv and conv["channel"] == "voice":
        asyncio.create_task(pay_routes.speak_representative_line(row))
    return ser(row)

@app.get("/conversations/{conv_id}/lines")
async def conv_lines(conv_id: str): return ser_all(await db.fetch("select * from transcript_lines where conversation_id = %s order by id", conv_id))

@app.post("/conversations/{conv_id}/end")
async def conv_end(conv_id: str):
    row = await db.update("conversations", conv_id, dict(state="Wrap-up", ended_at=db.now()))
    await hub.broadcast("conversation.updated", row)
    await db.emit("conversation.ended", dict(conversation_id=conv_id, case_id=row.get("case_id")))
    asyncio.create_task(cm.wrapup(conv_id))
    return ser(row)

class Close(BaseModel):
    dispositionCode: str | None = None; notes: str = ""

@app.post("/conversations/{conv_id}/close")
async def conv_close(conv_id: str, c: Close):
    conv = await db.one("select * from conversations where id = %s", conv_id)
    if conv["state"] == "Active":   # closing without End sends it back to the queue
        row = await db.update("conversations", conv_id, dict(state="Open", accepted_at=None))
        await hub.broadcast("conversation.updated", row); return ser(row)
    if not c.dispositionCode: raise HTTPException(422, "Select a disposition code before closing")
    row = await db.update("conversations", conv_id, dict(state="Closed", closed_at=db.now(), disposition_code=c.dispositionCode, notes=c.notes))
    await hub.broadcast("conversation.updated", row)
    if conv.get("case_id"):
        lines = await db.fetch("select who, text, to_char(at, 'HH12:MI AM') as at from transcript_lines where conversation_id = %s order by id", conv_id)
        contact = await db.one("select name from contacts where id = %s", conv["customer_id"])
        dur = int(((row["ended_at"] or db.now()) - (row["accepted_at"] or row["started_at"])).total_seconds())
        kind = "call" if conv["channel"] == "voice" else "chat"
        act = await db.insert("activities", dict(id=db.new_id("t"), case_id=conv["case_id"], type=kind, from_name=contact["name"], subject=f"{'Inbound call' if kind == 'call' else 'Chat'} – {conv.get('intent') or 'conversation'}", status="Closed", body=f"Duration {dur//60}:{dur%60:02d}. Disposition: {c.dispositionCode}.", transcript=lines))
        await hub.broadcast("activity.created", act)
        await case_changed(conv["case_id"])
    await db.emit("conversation.closed", dict(conversation_id=conv_id, case_id=conv.get("case_id")))
    return ser(row)

# ---------- Copilot on a conversation ----------
async def _conv_context(conv_id: str):
    conv = await db.one("select cv.*, ct.name as customer_name, a.name as account_name, q.name as queue_name from conversations cv join contacts ct on ct.id = cv.customer_id join accounts a on a.id = ct.account_id left join queues q on q.id = cv.queue_id where cv.id = %s", conv_id)
    if not conv: raise HTTPException(404)
    lines = await db.fetch("select who, text from transcript_lines where conversation_id = %s order by id", conv_id)
    case = await db.one("select number, title, status, priority, description, summary from cases where id = %s", conv["case_id"]) if conv.get("case_id") else None
    return conv, lines, case

COPILOT_SYSTEM = "You are Copilot in Dynamics 365 Customer Service, assisting a Strada Payroll Support representative during a live conversation. Be factual and brief; never invent amounts or policies; use only the transcript and case."

@app.post("/conversations/{conv_id}/suggest")
async def conv_suggest(conv_id: str):
    conv, lines, case = await _conv_context(conv_id)
    t = "\n".join(f"{l['who']}: {l['text']}" for l in lines)
    user = f"Customer: {conv['customer_name']} ({conv['account_name']}). Channel: {conv['channel']}.\nLinked case: {json.dumps(case, default=str)}\n\nTranscript:\n{t}\n\nWrite the representative's next reply to the customer: one to three sentences, first person, ready to send."
    def fb(): return f"Hi {conv['customer_name'].split()[0]}, this is {settings.owner} from Strada Payroll Support. I have everything the assistant gathered in front of me — let's get this sorted."
    text, model = await llm.text(COPILOT_SYSTEM, user, fallback=fb)
    return dict(text=text, model=model)

@app.post("/conversations/{conv_id}/summary")
async def conv_summary(conv_id: str):
    conv, lines, case = await _conv_context(conv_id)
    t = "\n".join(f"{l['who']}: {l['text']}" for l in lines)
    user = f"Customer: {conv['customer_name']} ({conv['account_name']}). Linked case: {json.dumps(case, default=str)}\n\nTranscript:\n{t}\n\nSummarise the conversation so far in one paragraph (what the customer needs, what was verified and found, what was done, what is still open)."
    def fb(): return f"{conv['customer_name']} contacted Strada Payroll Support by {conv['channel']}. " + " ".join(l['text'] for l in lines if l['who'] == 'Customer')[:300]
    text, model = await llm.text(COPILOT_SYSTEM, user, fallback=fb)
    row = await db.update("conversations", conv_id, dict(summary=text))
    await hub.broadcast("conversation.updated", row)
    return dict(text=text, model=model)

@app.post("/conversations/{conv_id}/nba")
async def conv_nba(conv_id: str):
    from .agents import next_best_action as nba
    out = await nba.evaluate(conv_id)
    return out or {}

@app.post("/conversations/{conv_id}/takeover")
async def conv_takeover(conv_id: str):
    """Supervisor/representative takes an assistant-handled conversation now: hand over with context and accept it in one step."""
    from . import tools
    from .agents import pay_assistant as pa
    conv = await db.one("select * from conversations where id = %s", conv_id)
    if not conv: raise HTTPException(404)
    if conv["state"] == "Assistant":
        await tools.transfer_to_representative(conv, dict(reason=f"Taken over by {settings.owner} from the monitoring view"))
        await tools.announce_transfer(conv)
        await pa.finish_run(conv_id, dict(outcome="taken_over", case_id=conv.get("case_id")))
    row = await db.update("conversations", conv_id, dict(state="Active", accepted_at=db.now(), waiting_seconds=0, assigned_to=settings.owner))
    await hub.broadcast("conversation.updated", row)
    return ser(row)

# ---------- events & demo ----------
class Event(BaseModel):
    type: str; payload: dict = {}; source: str = "external"

@app.post("/events")
async def post_event(e: Event): return ser(await db.emit(e.type, e.payload, e.source))

@app.get("/events")
async def list_events(limit: int = 50): return ser_all(await db.fetch("select * from events order by id desc limit %s", limit))

@app.get("/agent-runs")
async def list_runs(limit: int = 50): return ser_all(await db.fetch("select * from agent_runs order by started_at desc limit %s", limit))

class Clock(BaseModel):
    advanceSeconds: int = 0; reset: bool = False

@app.post("/demo/clock")
async def clock(c: Clock):
    cur = await db.one("select value from settings where key = 'demo_clock'")
    off = 0 if c.reset else cur["value"]["offset_seconds"] + c.advanceSeconds
    await db.execute("update settings set value = %s where key = 'demo_clock'", json.dumps(dict(offset_seconds=off)))
    await db.emit("clock.advanced", dict(offset_seconds=off), "demo")
    return dict(offset_seconds=off, now=(await db.demo_now()).isoformat())

SCENARIOS = {
    "ach-return-file": dict(label="Bank return file lands – Harbor Point BW-OPS (4 × R04)", strada=("/demo/scenario/ach-return-file", dict(pay_group="BW-OPS"))),
    "timesheet-cutoff": dict(label="Timesheet cut-off – Cascade Foods WK-PLANT (14 unapproved)", strada=("/demo/scenario/timesheet-cutoff", dict(pay_group="WK-PLANT"))),
    "advance-7-days": dict(label="Advance the clock 7 days (Day-7 verification)", clock=7 * 86400),
    "advance-1-day": dict(label="Advance the clock 1 day", clock=86400),
}

@app.get("/demo/scenarios")
async def scenarios():
    cur = await db.one("select value from settings where key = 'demo_clock'")
    return dict(scenarios=[dict(id=k, label=v["label"]) for k, v in SCENARIOS.items()], clock=dict(offset_seconds=cur["value"]["offset_seconds"], now=(await db.demo_now()).isoformat()))

@app.post("/demo/scenario/{name}")
async def run_scenario(name: str):
    sc = SCENARIOS.get(name)
    if not sc: raise HTTPException(404, "unknown scenario")
    if "strada" in sc:
        path, body = sc["strada"]
        res = await strada._send("POST", path, json=body)
        if res.get("error"): raise HTTPException(502, f"Strada systems: {res['error']}")
        return dict(scenario=name, result=res)
    return dict(scenario=name, result=await clock(Clock(advanceSeconds=sc["clock"])))

@app.get("/alerts")
async def list_alerts(contactId: str | None = None, limit: int = 50):
    if contactId: return ser_all(await db.fetch("select * from alerts where contact_id = %s order by sent_at desc limit %s", contactId, limit))
    return ser_all(await db.fetch("select * from alerts order by sent_at desc limit %s", limit))

@app.post("/demo/reset")
async def reset():
    import subprocess, sys, os
    seed = next(p for p in (os.path.join(os.path.dirname(__file__), "..", "..", "..", "packages", "schema", "seed.py"), os.path.join(os.path.dirname(__file__), "..", "packages", "schema", "seed.py")) if os.path.exists(p))
    subprocess.run([sys.executable, seed, "--dsn", settings.database_url], check=True)
    await db.execute("update settings set value = %s where key = 'demo_clock'", json.dumps(dict(offset_seconds=0)))
    try: await strada._send("POST", "/demo/reset")
    except Exception as e: print("strada-sys reset skipped:", e)
    await hub.broadcast("reset", {})
    return dict(ok=True)

# ---------- websocket ----------
@app.websocket("/ws")
async def ws(websocket: WebSocket):
    await hub.connect(websocket)
    try:
        while True: await websocket.receive_text()
    except WebSocketDisconnect:
        hub.disconnect(websocket)
