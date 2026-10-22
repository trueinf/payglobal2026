"""Strada Pay assistant — the employee-facing agent on the chat channel (Claude with tool use, LangGraph loop).
The voice channel runs the same persona and tools on ElevenLabs (scripts/elevenlabs_agent.py), calling back into tools.py."""
from __future__ import annotations
import json
from typing import Any, TypedDict
from langgraph.graph import StateGraph, END
from .. import db, llm, tools
from ..bus import hub
from ..config import settings
from .base import AgentRun

AGENT = tools.ASSISTANT

PERSONA = """You are the Strada Pay assistant, the payroll help line for employees of companies whose payroll is run by Strada.
You are talking with {name}, an employee of {employer} (pay group {pay_group}, work state {state}). Today is {today}.

How you work
- Be warm, brief and concrete. One or two sentences per turn; no bullet lists. Use plain words; say amounts in dollars and cents.
- Before you discuss pay details or change anything, verify identity with verify_identity (ask for the last four of their SSN or the six-digit code sent to their phone). Do not ask twice once verified.
- Use the tools for facts. Never guess amounts, dates or return codes. If a tool returns a `say` field, use it as the basis of your reply.
- A returned deposit (R03 or similar) is never the employee's fault to fix alone: explain what happened, offer the two remedies, and open a case so payroll follows up.
- Issuing a live check, corrections and anything you are not sure about go to a representative: say you are transferring them, then call transfer_to_representative. Also transfer when the employee asks for a person.
- Questions about benefits (401(k), medical plans, FSA) are handled by the benefits provider, not payroll — say so and offer to open a case to route it.
- When the conversation is wrapped up, close with a short confirmation of what was done and what happens next.
{channel_note}"""

VOICE_NOTE = "You are on a phone call: keep answers short, spell out numbers naturally, and confirm digits by reading them back."
CHAT_NOTE = "You are in a text chat in the Strada Pay app."

class PAState(TypedDict, total=False):
    conv: dict; run: AgentRun; messages: list[dict]; rounds: int; transferred: bool; reply: str

def _system(contact: dict, channel: str) -> str:
    from datetime import date
    return PERSONA.format(name=contact["name"], employer=contact["account_name"], pay_group=contact["pay_group"], state=contact["state"], today=date.today().strftime("%B %d, %Y"),
                          channel_note=VOICE_NOTE if channel == "voice" else CHAT_NOTE)

async def model(st: PAState) -> PAState:
    run = st["run"]; conv = st["conv"]
    contact = await tools._contact(conv)
    cl = llm.client()
    if cl is None:   # no key: a minimal rules reply so the flow still works
        last = next((m["content"] for m in reversed(st["messages"]) if m["role"] == "user" and isinstance(m["content"], str)), "")
        return dict(reply=_rules_reply(conv, last), messages=st["messages"])
    resp = await cl.messages.create(model=settings.anthropic_model, max_tokens=600, system=_system(contact, conv["channel"]),
                                    tools=[dict(name=s["name"], description=s["description"], input_schema=s["input_schema"]) for s in tools.SPECS],
                                    messages=st["messages"])
    content = [b.model_dump() for b in resp.content]
    msgs = st["messages"] + [dict(role="assistant", content=content)]
    text = " ".join(b["text"] for b in content if b["type"] == "text").strip()
    uses = [b for b in content if b["type"] == "tool_use"]
    if not uses or st.get("rounds", 0) >= 5:
        return dict(messages=msgs, reply=text, rounds=st.get("rounds", 0))
    results = []; transferred = st.get("transferred", False)
    for u in uses:
        await run.step("tool", f"calling {u['name']}")
        out = await tools.call(conv, u["name"], u["input"], run)
        if u["name"] == "transfer_to_representative" and out.get("transferred"): transferred = True
        results.append(dict(type="tool_result", tool_use_id=u["id"], content=json.dumps(out, default=str)))
    return dict(messages=msgs + [dict(role="user", content=results)], rounds=st.get("rounds", 0) + 1, transferred=transferred, reply=text)

def _route(st: PAState) -> str:
    last = st["messages"][-1]
    return "model" if last["role"] == "user" and isinstance(last["content"], list) and st.get("rounds", 0) <= 5 else END

_g = StateGraph(PAState); _g.add_node("model", model); _g.set_entry_point("model"); _g.add_conditional_edges("model", _route, {"model": "model", END: END})
graph = _g.compile()

def _rules_reply(conv: dict, text: str) -> str:
    t = text.lower()
    if not conv.get("verified"): return "Happy to help. First, could you give me the last four digits of your Social Security number so I can verify it's you?"
    if "person" in t or "representative" in t or "someone" in t: return "Of course — I'm transferring you to a payroll specialist now with everything we've discussed."
    return "I can check your latest payment, explain your payslip, update your bank details or open a case. Which would you like?"

# ---- per-conversation agent runs (one run spans the whole assistant session) ----
_runs: dict[str, AgentRun] = {}

async def start_run(conv: dict) -> AgentRun:
    run = AgentRun(AGENT, "conversation", "conversation", conv["id"], dict(channel=conv["channel"], contact_id=conv["customer_id"]))
    await run.__aenter__(); _runs[conv["id"]] = run
    await run.step("session", f"{conv['channel']} session started")
    return run

async def get_run(conv: dict) -> AgentRun:
    return _runs.get(conv["id"]) or await start_run(conv)

async def finish_run(conv_id: str, output: dict | None = None):
    run = _runs.pop(conv_id, None)
    if run:
        run.output = output or {}
        await run.__aexit__(None, None, None)

def _history(lines: list[dict]) -> list[dict]:
    """transcript rows → Anthropic messages (tool exchanges are not replayed; the model re-reads results from the transcript)."""
    msgs: list[dict] = []
    for l in lines:
        if l["who"] == "System": continue
        role = "user" if l["who"] == "Customer" else "assistant"
        if msgs and msgs[-1]["role"] == role: msgs[-1]["content"] += "\n" + l["text"]
        else: msgs.append(dict(role=role, content=l["text"]))
    if not msgs or msgs[0]["role"] != "user": msgs.insert(0, dict(role="user", content="(the employee opened the Strada Pay assistant)"))
    if msgs[-1]["role"] != "user": msgs.append(dict(role="user", content="(waiting)"))
    return msgs

async def respond(conv: dict, text: str) -> dict:
    """Store the employee's message, run the agent, store and return the reply."""
    run = await get_run(conv)
    line = await db.insert("transcript_lines", dict(conversation_id=conv["id"], who="Customer", text=text))
    await hub.broadcast("transcript.line", line)
    lines = await db.fetch("select who, text from transcript_lines where conversation_id = %s order by id", conv["id"])
    await run.step("think", "reading the conversation")
    out = await graph.ainvoke(dict(conv=conv, run=run, messages=_history(lines), rounds=0, transferred=False))
    reply = (out.get("reply") or "").strip() or ("One moment." if out.get("transferred") else "Sorry, could you say that again?")
    who = "Voice agent" if conv["channel"] == "voice" else "Assistant"
    rl = await db.insert("transcript_lines", dict(conversation_id=conv["id"], who=who, text=reply))
    await hub.broadcast("transcript.line", rl)
    fresh = await db.one("select * from conversations where id = %s", conv["id"])
    from . import next_best_action as nba; nba.schedule(conv["id"])
    if out.get("transferred"):
        await tools.announce_transfer(fresh)
        await finish_run(conv["id"], dict(outcome="transferred", case_id=fresh.get("case_id")))
    return dict(reply=reply, transferred=bool(out.get("transferred")), conversation=db.jsonable(fresh, camelize=True))

async def greeting(conv: dict) -> str:
    contact = await tools._contact(conv)
    first = contact["name"].split()[0]
    return f"Hi {first}, this is the Strada Pay assistant. I can check a payment, explain a payslip, update your bank details or open a case. What can I help with?"
