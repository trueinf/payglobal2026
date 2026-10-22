"""Customer Intent Agent (Microsoft-named) — discovers what employees actually contact about, from the cases and conversations themselves,
and keeps the intent list honest: counts per intent, intents rising this period, and contacts that fit no intent, script or article yet."""
from __future__ import annotations
import json
from datetime import timedelta
from .. import db, llm
from ..bus import hub
from .base import AgentRun

AGENT = "Customer Intent Agent"

SYSTEM = """You are the Customer Intent Agent in Dynamics 365 Customer Service for Strada Payroll Support. From the recent cases (title, description, current intent label) and conversations,
group them into customer intents in the customer's own terms. Keep the existing intent labels where they fit; propose a new intent only when several contacts share a need no label covers.
For each intent: count, trend versus the earlier half of the period, whether an agent script and a knowledge article exist for it, and one example. Then list gaps: intents without a script or article."""

SCHEMA = dict(type="object", required=["intents", "gaps", "summary"], properties=dict(
    intents=dict(type="array", items=dict(type="object", required=["intent", "count", "trend", "example", "has_script", "has_article"], properties=dict(intent=dict(type="string"), count=dict(type="integer"), trend=dict(type="string", enum=["up", "flat", "down", "new"]), example=dict(type="string"), has_script=dict(type="boolean"), has_article=dict(type="boolean"), proposed=dict(type="boolean", description="true if this is a new intent not in the current list")))),
    gaps=dict(type="array", items=dict(type="string")), summary=dict(type="string")))

async def discover(days: int = 14, trigger: str = "manual") -> dict:
    now = await db.demo_now(); since = now - timedelta(days=days); mid = now - timedelta(days=days / 2)
    async with AgentRun(AGENT, trigger, "intents", None, dict(days=days)) as run:
        await run.step("read", f"reading cases and conversations from the last {days} days")
        cases = await db.fetch("select number, title, left(description, 200) as description, intent, created_on, script_id, article_ids from cases where created_on >= %s order by created_on desc limit 120", since)
        scripts = await db.fetch("select intent from agent_scripts"); articles = await db.fetch("select title from knowledge_articles where status = 'Published'")
        counts: dict[str, dict] = {}
        for c in cases:
            k = c["intent"] or "Unclassified"; d = counts.setdefault(k, dict(total=0, recent=0, earlier=0))
            d["total"] += 1; d["recent" if c["created_on"] >= mid else "earlier"] += 1
        await run.tool("db.cases", dict(since=since.date().isoformat()), dict(cases=len(cases), by_intent=counts))
        def fb():
            out = []
            for k, d in sorted(counts.items(), key=lambda x: -x[1]["total"]):
                trend = "new" if d["earlier"] == 0 and d["recent"] else "up" if d["recent"] > d["earlier"] else "down" if d["recent"] < d["earlier"] else "flat"
                ex = next((c["title"] for c in cases if (c["intent"] or "Unclassified") == k), "")
                out.append(dict(intent=k, count=d["total"], trend=trend, example=ex, has_script=any(s["intent"] == k for s in scripts), has_article=any(c["article_ids"] for c in cases if (c["intent"] or "") == k), proposed=False))
            return dict(intents=out, gaps=[i["intent"] for i in out if not i["has_script"]], summary=f"{len(cases)} contacts across {len(out)} intents.")
        user = f"Period: {since.date()} to {now.date()} (midpoint {mid.date()})\nExisting intent labels with scripts: {[s['intent'] for s in scripts]}\nPublished articles: {[a['title'] for a in articles]}\nCounts by current label: {json.dumps(counts)}\nCases: {json.dumps([dict(number=c['number'], title=c['title'], description=c['description'], intent=c['intent'], created=str(c['created_on'])[:10], has_script=bool(c['script_id']), articles=len(c['article_ids'] or [])) for c in cases], default=str)[:7000]}"
        out, model = await llm.structured("customer_intent", SYSTEM, user, SCHEMA, fallback=fb)
        await run.tool("claude.structured", dict(model=model, task="customer_intent"), out)
        result = dict(at=now.isoformat(), period_days=days, cases=len(cases), **out)
        await db.execute("insert into settings (key, value) values ('intents', %s) on conflict (key) do update set value = excluded.value", json.dumps(result, default=str))
        await hub.broadcast("intents.updated", result)
        run.output = dict(intents=len(out["intents"]), gaps=len(out["gaps"]), proposed=sum(1 for i in out["intents"] if i.get("proposed")))
        return result
