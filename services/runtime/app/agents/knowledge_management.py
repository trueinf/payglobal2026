"""Customer Knowledge Management Agent — after a case resolves, drafts an article, checks for duplicates, marks it In review for Strada approval."""
from __future__ import annotations
import json
from .. import db, llm
from ..bus import hub
from .base import AgentRun, post

AGENT = "Customer Knowledge Management Agent"
SYSTEM = """You are the Customer Knowledge Management Agent at Strada Payroll Support. From a resolved case you write a reusable knowledge article for Wipro Tier-1 representatives: title, a two-sentence snippet, and 3–6 numbered steps. Remove all personal data (names, employee IDs, amounts specific to one person, account digits). Facts only, operational tone."""
SCHEMA = dict(type="object", required=["title", "snippet", "steps", "duplicate_of"], properties=dict(
    title=dict(type="string"), snippet=dict(type="string"), steps=dict(type="array", items=dict(type="string")),
    duplicate_of=dict(type="string", description="Existing article id if this case is already covered, else empty string"),
    audience=dict(type="string", enum=["Internal", "External"])))

async def draft_from_case(case_id: str):
    case = await db.one("select c.*, a.name as account_name from cases c join accounts a on a.id = c.account_id where c.id = %s", case_id)
    if not case or case["status"] != "Resolved": return
    if await db.one("select id from knowledge_articles where draft_from_case = %s", case_id): return
    notes = await db.fetch("select type, subject, body from activities where case_id = %s and type in ('note','autopost') order by at", case_id)
    existing = await db.fetch("select id, title, snippet from knowledge_articles where status = 'Published' order by id")
    async with AgentRun(AGENT, "event", "case", case_id, dict(intent=case["intent"])) as run:
        await run.step("read", "reading the resolved case and the existing knowledge base")
        await run.tool("db.knowledge_articles", dict(status="Published"), [e["id"] for e in existing])
        def fb():
            return dict(title=f"{case['title']} – resolution steps", snippet=f"How this type of case was resolved. {case.get('resolution') or ''}".strip(), steps=[h for h in case["highlights"]][:5] or [case["description"][:200]], duplicate_of="", audience="Internal")
        user = f"Case: {json.dumps({k: case[k] for k in ('title','intent','description','summary','highlights','resolution')}, default=str)}\nNotes: {json.dumps(notes, default=str)}\nExisting articles: {json.dumps(existing, default=str)}"
        out, model = await llm.structured("article_draft", SYSTEM, user, SCHEMA, fallback=fb)
        await run.tool("claude.structured", dict(model=model, task="article_draft"), out)
        if out.get("duplicate_of"):
            await post(case_id, AGENT, "Knowledge gap check", f"Resolution already covered by {out['duplicate_of']}; no new article drafted.")
            run.output = dict(duplicate_of=out["duplicate_of"]); return
        n = 1200 + (await db.one("select count(*) as n from knowledge_articles"))["n"]
        row = await db.insert("knowledge_articles", dict(id=f"KA-0{n}", title=out["title"], snippet=out["snippet"], body=out["steps"], audience=out.get("audience", "Internal"), status="In review", kb=f"{case['account_name']} KB", draft_from_case=case_id))
        await hub.broadcast("article.created", row)
        await post(case_id, AGENT, f"Knowledge article drafted: {row['id']}", f"{out['title']} — PII scrubbed, status In review, pending Strada approval.")
        await db.emit("article.drafted", dict(article_id=row["id"], case_id=case_id))
        run.output = dict(article_id=row["id"])
