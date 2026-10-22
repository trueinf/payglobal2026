"""Client Insight Agent — the client payroll lead's brief, written from the data rather than from memory.
For one client account over a period: what drove contacts, what the agents prevented, incidents and their root causes, what is still open,
and the three things that would remove the most contacts next period. Stored per account; shown on the Account form and the Prevention dashboard."""
from __future__ import annotations
import json
from datetime import timedelta
from .. import db, llm
from ..bus import hub
from .base import AgentRun

AGENT = "Client Insight Agent"

SYSTEM = """You are the Client Insight Agent for Strada Payroll Support. Write the period brief for one client's payroll lead from the figures and case list given.
Lead with what matters to the client: employees affected, what was prevented before anyone called, incidents and causes, what is still open with dates. Then three recommendations that remove contacts
next period, each tied to a cause in the data (for example an import validation, a bank routing check before release, a manager approval reminder). Numbers only from the data; no filler."""

SCHEMA = dict(type="object", required=["headline", "drivers", "prevented", "open_items", "recommendations", "client_message"], properties=dict(
    headline=dict(type="string"),
    drivers=dict(type="array", items=dict(type="object", required=["intent", "count", "note"], properties=dict(intent=dict(type="string"), count=dict(type="integer"), note=dict(type="string")))),
    prevented=dict(type="string", description="what the agents did before employees called, with counts"),
    incidents=dict(type="array", items=dict(type="object", required=["number", "root_cause", "status"], properties=dict(number=dict(type="string"), root_cause=dict(type="string"), status=dict(type="string")))),
    open_items=dict(type="array", items=dict(type="string")),
    recommendations=dict(type="array", items=dict(type="object", required=["action", "why", "removes"], properties=dict(action=dict(type="string"), why=dict(type="string"), removes=dict(type="string", description="which contacts it removes")))),
    client_message=dict(type="string", description="Four or five sentences to the payroll lead, ready to send")))

async def run(account_id: str, days: int = 14, trigger: str = "manual") -> dict | None:
    acct = await db.one("select * from accounts where id = %s", account_id)
    if not acct: return None
    now = await db.demo_now(); since = now - timedelta(days=days)
    async with AgentRun(AGENT, trigger, "account", account_id, dict(days=days)) as run:
        await run.step("aggregate", f"reading {acct['name']}'s cases, alerts and incidents for the last {days} days")
        cases = await db.fetch("select c.number, c.title, c.intent, c.status, c.priority, c.created_on, c.resolved_on, c.created_by, c.incident, c.verification, ct.name as customer from cases c join contacts ct on ct.id = c.customer_id where c.account_id = %s and c.created_on >= %s order by c.created_on desc", account_id, since)
        alerts = await db.fetch("select kind, agent, sent_at from alerts where account_id = %s and sent_at >= %s", account_id, since)
        convs = await db.fetch("select cv.channel, cv.state, cv.handled_by_assistant, cv.disposition_code, cv.quality from conversations cv join contacts ct on ct.id = cv.customer_id where ct.account_id = %s and cv.started_at >= %s", account_id, since)
        by_intent: dict[str, int] = {}
        for c in cases: by_intent[c["intent"] or "Other"] = by_intent.get(c["intent"] or "Other", 0) + 1
        stats = dict(period_days=days, cases=len(cases), by_intent=by_intent, open=sum(1 for c in cases if c["status"] != "Resolved"), resolved=sum(1 for c in cases if c["status"] == "Resolved"),
                     proactive_cases=sum(1 for c in cases if c["created_by"] == "Pay Event Sentinel"), alerts=len(alerts), alerts_by_kind={}, incidents=[dict(number=c["number"], root_cause=(c["incident"] or {}).get("root_cause"), confidence=(c["incident"] or {}).get("confidence"), status=c["status"], affected=len((c["incident"] or {}).get("affected", []))) for c in cases if c["incident"]],
                     day7=dict(settled=sum(1 for c in cases if (c["verification"] or {}).get("outcome") == "settled"), reopened=sum(1 for c in cases if (c["verification"] or {}).get("outcome") == "reopened")),
                     conversations=len(convs), resolved_by_assistant=sum(1 for v in convs if v["disposition_code"] == "Resolved by assistant"), transferred=sum(1 for v in convs if v["handled_by_assistant"] and v["state"] != "Assistant" and v["disposition_code"] != "Resolved by assistant"))
        for a in alerts: stats["alerts_by_kind"][a["kind"]] = stats["alerts_by_kind"].get(a["kind"], 0) + 1
        await run.tool("db.aggregate", dict(account=acct["name"]), stats)
        await run.step("write", "writing the brief")
        def fb():
            top = sorted(by_intent.items(), key=lambda x: -x[1])[:3]
            return dict(headline=f"{len(cases)} cases in {days} days; {stats['proactive_cases']} opened before the employee called; {len(stats['incidents'])} incident(s).", drivers=[dict(intent=i, count=n, note="") for i, n in top], prevented=f"{stats['alerts']} notifications sent by the agents; {stats['proactive_cases']} cases opened proactively.", incidents=[dict(number=i["number"], root_cause=i["root_cause"] or "", status=i["status"]) for i in stats["incidents"]], open_items=[f"{c['number']} · {c['title']}" for c in cases if c["status"] != "Resolved"][:5], recommendations=[dict(action="Validate bank routing numbers before each ACH release", why="returns clustered on one routing number", removes="pay-not-received contacts after a bank change")], client_message=f"Over the last {days} days we handled {len(cases)} cases for {acct['name']}. Details attached.")
        user = f"Client: {acct['name']} · pay groups {acct['pay_groups']} · period {since.date()} to {now.date()}\nFigures: {json.dumps(stats, default=str)}\nCases: {json.dumps([dict(number=c['number'], title=c['title'], intent=c['intent'], status=c['status'], priority=c['priority'], created=str(c['created_on'])[:10], by=c['created_by'], customer=c['customer']) for c in cases], default=str)[:6000]}"
        out, model = await llm.structured("client_insight", SYSTEM, user, SCHEMA, fallback=fb)
        await run.tool("claude.structured", dict(model=model, task="client_insight"), out)
        brief = dict(at=now.isoformat(), period=dict(days=days, since=since.date().isoformat(), until=now.date().isoformat()), stats=stats, **out)
        row = await db.insert("client_insights", dict(account_id=account_id, period=f"{since.date()}..{now.date()}", brief=brief))
        await hub.broadcast("insight.created", dict(id=row["id"], account_id=account_id, brief=brief, created_at=row["created_at"]))
        await db.emit("insight.created", dict(account_id=account_id, id=row["id"]))
        run.output = dict(account_id=account_id, account=acct["name"], cases=len(cases), recommendations=len(out["recommendations"]))
        return brief
