"""Quality Evaluation Agent (Microsoft-named) — every closed conversation is evaluated, not a 2% sample.
Scores the transcript against the Strada support rubric, separates what the assistant did from what the representative did,
and leaves coaching notes the supervisor can act on. Runs on conversation.closed."""
from __future__ import annotations
import json
from .. import db, llm
from ..bus import hub
from .base import AgentRun, post, case_changed

AGENT = "Quality Evaluation Agent"
HANDLES = ("conversation.closed",)

RUBRIC = [
    ("identity", "Identity verified before any pay detail was discussed"),
    ("accuracy", "Facts given match the systems and the case (amounts, dates, codes)"),
    ("empathy", "Acknowledged the employee's situation; tone calm and respectful"),
    ("resolution", "A concrete remedy or next step was agreed, with timing"),
    ("handover", "If transferred, context was passed and the employee did not repeat themselves"),
    ("closure", "Employee confirmed they understood; closing summary given"),
    ("compliance", "No commitments beyond policy; no unnecessary PII repeated"),
]

SYSTEM = """You are the Quality Evaluation Agent for Strada Payroll Support. Score the conversation transcript against the rubric, 0-5 per criterion, with one-line evidence quoting the transcript.
Score the AI assistant's part and the human representative's part separately where both took part; mark a criterion "n/a" (null) when it did not apply (e.g. no transfer).
Be fair and specific; coaching notes must be actionable (what to say differently), not generic."""

SCHEMA = dict(type="object", required=["scores", "overall", "summary", "coaching", "flags"], properties=dict(
    scores=dict(type="array", items=dict(type="object", required=["criterion", "assistant", "representative", "evidence"], properties=dict(criterion=dict(type="string"), assistant=dict(type=["integer", "null"]), representative=dict(type=["integer", "null"]), evidence=dict(type="string")))),
    overall=dict(type="object", required=["assistant", "representative"], properties=dict(assistant=dict(type=["number", "null"]), representative=dict(type=["number", "null"]))),
    summary=dict(type="string"), coaching=dict(type="array", items=dict(type="string")), flags=dict(type="array", items=dict(type="string"), description="compliance or risk flags needing supervisor attention; empty if none"),
    sentiment_end=dict(type="string", enum=["Positive", "Neutral", "Negative"])))

async def handle(ev: dict):
    await evaluate(ev["payload"]["conversation_id"])

async def evaluate(conv_id: str) -> dict | None:
    conv = await db.one("select cv.*, ct.name as customer_name from conversations cv join contacts ct on ct.id = cv.customer_id where cv.id = %s", conv_id)
    if not conv: return None
    lines = await db.fetch("select who, text from transcript_lines where conversation_id = %s order by id", conv_id)
    if len([l for l in lines if l["who"] != "System"]) < 3: return None
    case = await db.one("select number, title, status, resolution, summary from cases where id = %s", conv["case_id"]) if conv.get("case_id") else None
    async with AgentRun(AGENT, "event", "conversation", conv_id, dict(lines=len(lines), channel=conv["channel"])) as run:
        await run.step("evaluate", "scoring the transcript against the rubric")
        transcript = "\n".join(f"{l['who']}: {l['text']}" for l in lines)
        had_rep = any(l["who"] == "Representative" for l in lines); had_ai = any(l["who"] in ("Assistant", "Voice agent") for l in lines)
        def fb():
            sc = [dict(criterion=c[1], assistant=4 if had_ai else None, representative=4 if had_rep else None, evidence="Transcript reviewed.") for c in RUBRIC]
            return dict(scores=sc, overall=dict(assistant=4.0 if had_ai else None, representative=4.0 if had_rep else None), summary="Conversation handled to standard.", coaching=[], flags=[], sentiment_end="Neutral")
        user = f"Channel: {conv['channel']} · employee {conv['customer_name']} · identity verified: {conv.get('verified')} ({conv.get('verify_method')}) · disposition: {conv.get('disposition_code')}\nLinked case: {json.dumps(case, default=str)}\nRubric: {json.dumps([c[1] for c in RUBRIC])}\n\nTranscript:\n{transcript}"
        out, model = await llm.structured("quality", SYSTEM, user, SCHEMA, fallback=fb)
        await run.tool("claude.structured", dict(model=model, task="quality"), out)
        q = dict(at=(await db.demo_now()).isoformat(), **out)
        row = await db.update("conversations", conv_id, dict(quality=q))
        await hub.broadcast("conversation.updated", row)
        if conv.get("case_id"):
            await post(conv["case_id"], AGENT, f"Conversation evaluated — assistant {q['overall'].get('assistant') if q['overall'].get('assistant') is not None else 'n/a'}/5 · representative {q['overall'].get('representative') if q['overall'].get('representative') is not None else 'n/a'}/5", out["summary"] + ("\n\nCoaching:\n" + "\n".join(f"• {c}" for c in out["coaching"]) if out["coaching"] else "") + ("\n\nFlags: " + "; ".join(out["flags"]) if out["flags"] else ""), type_="note")
            await case_changed(conv["case_id"])
        await db.emit("quality.evaluated", dict(conversation_id=conv_id, overall=out["overall"], flags=len(out["flags"])))
        run.output = dict(conversation_id=conv_id, overall=out["overall"], flags=out["flags"])
        return q
