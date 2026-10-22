"""Next Best Action Agent — watches a live conversation (assistant-handled or with a representative) and, after each customer turn,
states where the conversation is, what should happen next, and whether a human should step in. Output is stored on the
conversation (`nba`) and streamed to the workspace, where the supervisor's Monitor view shows it."""
from __future__ import annotations
import asyncio, json
from .. import db, llm
from ..bus import hub
from .base import AgentRun

AGENT = "Next Best Action Agent"

SYSTEM = """You are the Next Best Action Agent inside Strada Payroll Support's Dynamics 365 Customer Service. You watch a live
conversation between an employee and either the Strada Pay assistant (an AI) or a human representative, and advise the supervisor.
Use only the transcript, the tool results and the case. Be concrete and brief. Recommend a human take-over only when the AI is
stuck, the employee is upset or asks for a person, money is at stake beyond what the assistant can do (live check, corrections),
or identity could not be verified."""

SCHEMA = dict(type="object", required=["intent", "stage", "next_best_action", "rationale", "risk", "intervene"], properties=dict(
    intent=dict(type="string", description="What the employee needs, in five words or fewer"),
    stage=dict(type="string", enum=["Greeting", "Verifying identity", "Diagnosing", "Explaining", "Resolving", "Handing over", "With representative", "Wrapping up"]),
    next_best_action=dict(type="string", description="The single best next step for whoever is handling the conversation, one sentence"),
    rationale=dict(type="string", description="Why, one sentence, citing a fact from the transcript or systems"),
    risk=dict(type="string", enum=["Low", "Medium", "High"], description="Risk of a poor outcome if nothing changes"),
    intervene=dict(type="boolean", description="Should a human representative take over now?"),
    intervene_reason=dict(type="string"),
    sentiment=dict(type="string", enum=["Positive", "Neutral", "Slightly negative", "Negative"]),
    suggested_opening=dict(type="string", description="If a representative takes over, their first sentence to the employee")))

_pending: dict[str, asyncio.Task] = {}

def schedule(conv_id: str, delay: float = 1.5):
    """Debounced: one evaluation per burst of lines."""
    t = _pending.pop(conv_id, None)
    if t and not t.done(): t.cancel()
    async def run():
        try:
            await asyncio.sleep(delay); await evaluate(conv_id)
        except asyncio.CancelledError: pass
        except Exception as e: print("nba error", e)
    _pending[conv_id] = asyncio.create_task(run())

async def evaluate(conv_id: str) -> dict | None:
    conv = await db.one("select cv.*, ct.name as customer_name, a.name as account_name from conversations cv join contacts ct on ct.id = cv.customer_id join accounts a on a.id = ct.account_id where cv.id = %s", conv_id)
    if not conv or conv["state"] in ("Closed", "Wrap-up"): return None
    lines = await db.fetch("select who, text from transcript_lines where conversation_id = %s order by id", conv_id)
    if not any(l["who"] == "Customer" for l in lines): return None
    case = await db.one("select number, title, status, priority, intent from cases where id = %s", conv["case_id"]) if conv.get("case_id") else None
    runs = await db.fetch("select tool_calls from agent_runs where subject_type = 'conversation' and subject_id = %s order by started_at desc limit 1", conv_id)
    tools = [dict(tool=t["tool"], result=t.get("result")) for r in runs for t in (r["tool_calls"] or [])][-6:]
    handler = "the Strada Pay assistant (AI)" if conv["state"] == "Assistant" else "a human representative" if conv["state"] == "Active" else "nobody yet — waiting in the queue"
    transcript = "\n".join(f"{l['who']}: {l['text']}" for l in lines)
    user = f"""Employee: {conv['customer_name']} · {conv['account_name']} · channel {conv['channel']} · identity verified: {conv.get('verified')}
Currently handled by: {handler}
Linked case: {json.dumps(case, default=str)}
Recent tool calls by the assistant: {json.dumps(tools, default=str)[:2500]}

Transcript so far:
{transcript}"""
    async with AgentRun(AGENT, "conversation", "conversation", conv_id, dict(lines=len(lines), state=conv["state"])) as run:
        await run.step("evaluate", "reading the live transcript")
        def fb():
            last = next((l["text"].lower() for l in reversed(lines) if l["who"] == "Customer"), "")
            wants_person = any(w in last for w in ("person", "representative", "someone", "human"))
            return dict(intent="Pay not received" if "pay" in transcript.lower() else "Payroll enquiry", stage="Handing over" if wants_person else "Diagnosing",
                        next_best_action="Transfer to a representative with context." if wants_person else "Verify identity, then check payment status.",
                        rationale="Employee asked for a person." if wants_person else "Standard path for a pay enquiry.", risk="Medium" if wants_person else "Low",
                        intervene=wants_person, intervene_reason="Employee asked for a person." if wants_person else "", sentiment="Neutral", suggested_opening=f"Hi {conv['customer_name'].split()[0]}, this is Strada Payroll Support — I have everything the assistant gathered in front of me.")
        out, model = await llm.structured("next_best_action", SYSTEM, user, SCHEMA, fallback=fb)
        await run.tool("claude.structured", dict(model=model, task="next_best_action"), out)
        row = await db.update("conversations", conv_id, dict(nba=out, nba_at=db.now(), sentiment=out.get("sentiment") or conv["sentiment"]))
        run.output = dict(stage=out["stage"], intervene=out["intervene"], risk=out["risk"])
        await hub.broadcast("conversation.updated", row)
        return out
