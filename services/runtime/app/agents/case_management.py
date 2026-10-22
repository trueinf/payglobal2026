"""Case Management Agent — creates cases from conversations and emails, predicts and fills fields, updates at wrap-up, follows up and closes.
Graph: gather → predict → write → (summarise) ; wrap-up and follow-up are separate entry points on the same tools.
"""
from __future__ import annotations
import json, random
from typing import TypedDict, Any
from langgraph.graph import StateGraph, END
from .. import db, llm
from ..config import settings
from ..strada import strada
from ..bus import hub
from .base import AgentRun, post, case_changed

AGENT = "Case Management Agent"

INTENTS = {
    "Pay not received – bank return": ("Pay distribution", "q1", "US Payroll – Direct Deposit", "Problem", "High"),
    "Payslip variance": ("Payslip & net pay", "q2", "US Payroll – Pay Statement", "Question", "Normal"),
    "Document request": ("Employee documents", "q5", "US Payroll – Tax Documents", "Request", "Low"),
    "Tax withholding change": ("Tax & withholding", "q3", "US Payroll – State Tax", "Question", "Normal"),
    "Garnishment question": ("Garnishments & deductions", "q4", "US Payroll – Garnishments", "Problem", "High"),
    "Final pay timing": ("Ongoing processing", "q2", "US Payroll – Off-cycle", "Question", "Normal"),
    "Time import failure": ("Ongoing processing", "q2", "US Payroll – Time Import", "Problem", "Normal"),
    "Employee data change": ("Employee data", "q2", "US Payroll – Employee Data", "Request", "Low"),
    "Benefits misroute": ("Benefits – misroute", "q6", "Benefits (Alight)", "Question", "Low"),
    "Unclassified": ("General", "q2", "US Payroll", "Question", "Normal"),
}

class CMState(TypedDict, total=False):
    run: Any
    source: str                  # chat | email | voice
    contact_id: str
    text: str                    # email body or transcript text
    subject_hint: str
    context: dict
    prediction: dict
    case_id: str
    case: dict
    conversation_id: str

PREDICT_SCHEMA = dict(type="object", required=["title", "intent", "subject", "priority", "type", "product", "description", "summary", "highlights"], properties=dict(
    title=dict(type="string", description="Case title in the operational style used by the team, max 80 chars, no customer name"),
    intent=dict(type="string", enum=list(INTENTS.keys())),
    subject=dict(type="string"), priority=dict(type="string", enum=["High", "Normal", "Low"]), type=dict(type="string", enum=["Problem", "Question", "Request"]),
    product=dict(type="string"), description=dict(type="string", description="2–4 sentences of facts only: what the employee reported, what the systems show (amounts, codes, dates), what was offered"),
    summary=dict(type="string", description="One paragraph case summary for the representative"),
    highlights=dict(type="array", items=dict(type="string"), description="3–4 bullet highlights"),
    confidence=dict(type="number")))

SYSTEM = """You are the Case Management Agent inside Dynamics 365 Customer Service at Strada, a US payroll provider. Wipro Tier-1 representatives work the cases.
You read a customer conversation or email plus the facts the Strada systems return, and you fill the case fields precisely. Facts only; never invent amounts, codes or dates — use the system data provided. Write in the team's operational style (short, specific, no AI phrasing)."""

def _rules_prediction(st: CMState) -> dict:
    t = (st.get("text") or "").lower(); ctx = st.get("context", {}); pay = ctx.get("payment") or {}
    if pay.get("status") == "returned" or "didn't come" in t or "not received" in t or "missing deposit" in t or "pay didn" in t:
        intent = "Pay not received – bank return"
        desc = f"Employee reports missing deposit on pay date. {pay.get('method','ACH')} return {pay.get('return_code','')} for {ctx.get('employee',{}).get('employee_id','')}, amount {pay.get('amount','')}. Bank account on file ends {ctx.get('employee',{}).get('bank',{}).get('account_last4','')}."
        title = f"Pay not received – direct deposit returned ({pay.get('return_code','R03')})"
    elif "w-2" in t or "w2" in t: intent, title, desc = "Document request", "Request copy of W-2", "Employee requests a copy of a W-2. Identity to be confirmed against the profile on file before reissue."
    elif "withholding" in t or "moved" in t or "state tax" in t: intent, title, desc = "Tax withholding change", "State withholding change after a move", "Employee reports a state move; withholding still applied for the previous state."
    elif "garnish" in t or "deduction" in t or "child support" in t: intent, title, desc = "Garnishment question", "Garnishment deduction query", "Employee questions a garnishment deduction on the pay statement."
    elif "final pay" in t or "terminated" in t: intent, title, desc = "Final pay timing", "Final pay timing", "Final pay deadline question under state rules."
    elif "fsa" in t or "401" in t or "benefit" in t: intent, title, desc = "Benefits misroute", "Benefits question – route to Alight", "Benefits question; handled by Alight."
    elif "address" in t or "bank account" in t: intent, title, desc = "Employee data change", "Employee data change", "Employee data change requested."
    else: intent, title, desc = "Unclassified", (st.get("subject_hint") or "New enquiry")[:80], (st.get("text") or "")[:300]
    subject, _, product, type_, priority = INTENTS[intent]
    name = ctx.get("contact", {}).get("name", "The employee")
    return dict(title=title, intent=intent, subject=subject, priority=priority, type=type_, product=product, description=desc,
                summary=f"{name} contacted Strada Payroll Support. {desc}", highlights=[desc[:120], "Case created by the Case Management Agent."], confidence=0.6)

async def gather(st: CMState) -> CMState:
    run: AgentRun = st["run"]; await run.step("gather", "reading the conversation and the Strada systems")
    ctx: dict = {}
    contact = await db.one("select c.*, a.name as account_name from contacts c join accounts a on a.id = c.account_id where c.id = %s", st["contact_id"])
    if not contact: raise ValueError(f"unknown contact {st['contact_id']}")
    ctx["contact"] = contact
    try:
        emp = await strada.employee(contact["employee_id"]); ctx["employee"] = emp; await run.tool("strada.employee", dict(employee_id=contact["employee_id"]), dict(pay_group=emp.get("pay_group"), bank=emp.get("bank")))
        pay = await strada.payment_status(contact["employee_id"]); ctx["payment"] = pay; await run.tool("strada.payment_status", dict(employee_id=contact["employee_id"]), pay)
    except Exception as e:
        await run.tool("strada", dict(employee_id=contact["employee_id"]), dict(error=str(e)))
    recent = await db.fetch("select number, title, status from cases where customer_id = %s order by created_on desc limit 3", st["contact_id"])
    ctx["recent_cases"] = recent
    return dict(context=ctx)

async def predict(st: CMState) -> CMState:
    run: AgentRun = st["run"]; await run.step("predict", "predicting case fields")
    ctx = st["context"]
    user = f"""Source: {st['source']}
Customer: {ctx['contact']['name']} · {ctx['contact']['account_name']} · employee {ctx['contact']['employee_id']} · pay group {ctx['contact']['pay_group']} · state {ctx['contact']['state']}
Payment status (Strada): {json.dumps(ctx.get('payment'), default=str)}
Bank on file: {json.dumps(ctx.get('employee', {}).get('bank'), default=str)}
Recent cases: {json.dumps(ctx.get('recent_cases'), default=str)}
Subject hint: {st.get('subject_hint','')}

Conversation / message:
{st['text']}"""
    pred, model = await llm.structured("case_fields", SYSTEM, user, PREDICT_SCHEMA, fallback=lambda: _rules_prediction(st))
    await run.tool("claude.structured", dict(model=model, task="case_fields"), pred)
    return dict(prediction=pred)

async def write(st: CMState) -> CMState:
    run: AgentRun = st["run"]; await run.step("write", "creating the case")
    p = st["prediction"]; ctx = st["context"]
    subject, queue, product, type_, priority = INTENTS.get(p["intent"], INTENTS["Unclassified"])
    n = random.randint(10500, 10999); cid = db.new_id("k")
    origin = {"chat": "Chat", "email": "Email", "voice": "Phone"}[st["source"]]
    fields = ["title", "subject", "priority", "type", "product", "description"]
    case = await db.insert("cases", dict(
        id=cid, number=f"CAS-{n}-{cid[-4:].upper()}", title=p["title"], customer_id=ctx["contact"]["id"], account_id=ctx["contact"]["account_id"],
        subject=p.get("subject") or subject, priority=p.get("priority") or priority, status="In Progress", origin=origin, type=p.get("type") or type_,
        product=p.get("product") or product, description=p["description"], owner=settings.owner, queue_id=queue, intent=p["intent"],
        script_id={"Pay not received – bank return": "s1", "Document request": "s3", "Tax withholding change": "s4", "Garnishment question": "s5"}.get(p["intent"]),
        ai_created=True, ai_fields=fields, suggestions_pending=True, summary=p["summary"], highlights=p["highlights"],
        first_response_sent=st["source"] != "email", resolve_by=await _resolve_by(p.get("priority") or priority)))
    await run.tool("db.cases.insert", dict(number=case["number"]), dict(id=cid))
    if st["source"] in ("chat", "voice"):
        await db.insert("activities", dict(id=db.new_id("t"), case_id=cid, type="chat" if st["source"] == "chat" else "call", from_name=ctx["contact"]["name"], subject=st.get("subject_hint") or p["title"], status="Closed",
                                           transcript=_transcript(st["text"]) if st["source"] == "chat" else None, body=None if st["source"] == "chat" else st["text"]))
    else:
        await db.insert("activities", dict(id=db.new_id("t"), case_id=cid, type="email", direction="in", from_name=ctx["contact"]["name"], subject=st.get("subject_hint") or p["title"], body=st["text"]))
    await post(cid, AGENT, f"Case created from {st['source']}", f"Case created from inbound {st['source']}. Intent: {p['intent']}. Fields populated: {', '.join(f.title() for f in fields)}.")
    if st.get("conversation_id"):
        await db.execute("update conversations set case_id = %s, intent = %s where id = %s", cid, p["intent"], st["conversation_id"])
    await db.emit("case.created", dict(case_id=cid, intent=p["intent"], contact_id=ctx["contact"]["id"], account_id=ctx["contact"]["account_id"], pay_group=ctx["contact"]["pay_group"], source=st["source"]))
    run.output = dict(case_id=cid, number=case["number"], intent=p["intent"], fields=fields)
    await case_changed(cid)
    return dict(case_id=cid, case=case)

async def _resolve_by(priority: str):
    from datetime import timedelta
    days = {"High": 1, "Normal": 3, "Low": 5}[priority]
    return (await db.demo_now() + timedelta(days=days)).replace(hour=17, minute=0, second=0, microsecond=0)

def _transcript(text: str) -> list[dict]:
    out = []
    for line in text.splitlines():
        if ":" in line:
            who, _, msg = line.partition(":"); out.append(dict(who=who.strip(), text=msg.strip(), at=""))
    return out or [dict(who="Customer", text=text, at="")]

_graph = StateGraph(CMState)
_graph.add_node("gather", gather); _graph.add_node("predict", predict); _graph.add_node("write", write)
_graph.set_entry_point("gather"); _graph.add_edge("gather", "predict"); _graph.add_edge("predict", "write"); _graph.add_edge("write", END)
create_graph = _graph.compile()

# ---- entry points ----
async def create_from(source: str, contact_id: str, text: str, subject_hint: str = "", conversation_id: str | None = None) -> dict:
    async with AgentRun(AGENT, "conversation" if source != "email" else "event", "contact", contact_id, dict(source=source, subject=subject_hint, chars=len(text))) as run:
        out = await create_graph.ainvoke(dict(run=run, source=source, contact_id=contact_id, text=text, subject_hint=subject_hint, conversation_id=conversation_id))
        return out["case"]

WRAPUP_SCHEMA = dict(type="object", required=["description_append", "summary", "highlights", "status"], properties=dict(
    description_append=dict(type="string", description="One or two factual sentences to append to the case description from the conversation"),
    summary=dict(type="string"), highlights=dict(type="array", items=dict(type="string")),
    status=dict(type="string", enum=["In Progress", "Waiting for Details", "Researching", "Resolved"]), resolution=dict(type="string")))

async def wrapup(conversation_id: str) -> dict | None:
    """Documented wrap-up behaviour: when a conversation ends, update the linked case from the transcript and leave a summary note."""
    conv = await db.one("select * from conversations where id = %s", conversation_id)
    if not conv or not conv.get("case_id"): return None
    case = await db.one("select * from cases where id = %s", conv["case_id"])
    lines = await db.fetch("select who, text from transcript_lines where conversation_id = %s order by id", conversation_id)
    transcript = "\n".join(f"{l['who']}: {l['text']}" for l in lines)
    async with AgentRun(AGENT, "conversation", "case", case["id"], dict(conversation_id=conversation_id, lines=len(lines))) as run:
        await run.step("wrap-up", "updating the case from the conversation")
        def fb():
            rep = [l["text"] for l in lines if l["who"] == "Representative"]
            return dict(description_append=(" ".join(rep)[:240] or "Conversation completed."), summary=case["summary"], highlights=case["highlights"] + ["Call completed; representative confirmed next steps."], status=case["status"], resolution=None)
        out, model = await llm.structured("wrapup", SYSTEM, f"Existing case:\n{json.dumps({k: case[k] for k in ('title','description','summary','status')}, default=str)}\n\nConversation transcript:\n{transcript}", WRAPUP_SCHEMA, fallback=fb)
        await run.tool("claude.structured", dict(model=model, task="wrapup"), out)
        patch = dict(description=(case["description"] + " " + out["description_append"]).strip(), summary=out["summary"], highlights=out["highlights"], ai_updated=True, ai_fields=sorted(set(case["ai_fields"]) | {"description", "summary"}))
        if out.get("status") and out["status"] != case["status"]: patch["status"] = out["status"]; patch["ai_fields"].append("status")
        await db.update("cases", case["id"], patch)
        await post(case["id"], AGENT, "Conversation summary", out["summary"], type_="note")
        await db.emit("case.updated", dict(case_id=case["id"], by=AGENT, reason="wrap-up"))
        run.output = dict(case_id=case["id"], fields=patch["ai_fields"])
        return await case_changed(case["id"])

async def accept_suggestions(case_id: str) -> dict:
    await db.update("cases", case_id, dict(suggestions_pending=False))
    await post(case_id, settings.owner, "Suggestions accepted", "Representative accepted the fields predicted by the Case Management Agent.")
    return await case_changed(case_id)

async def schedule_followups(case_id: str, items: list[tuple[str, int]]):
    """items: (subject, days_ahead). Creates agent-owned tasks; the scheduler closes the case when the condition holds."""
    from datetime import timedelta
    base = await db.demo_now()
    for subject, days in items:
        await db.insert("activities", dict(id=db.new_id("t"), case_id=case_id, type="task", from_name=AGENT, agent=AGENT, subject=subject, status="Open", due=(base + timedelta(days=days)).replace(hour=10, minute=0), ai_generated=True))
    await case_changed(case_id)
