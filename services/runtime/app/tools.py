"""The Strada Pay assistant's tools. One implementation, two callers:
 - the chat agent (Claude tool use, agents/pay_assistant.py)
 - the ElevenLabs voice agent (client tools in the employee app → POST /pay/sessions/{id}/tools/{name})
Every tool takes the conversation row and the model's arguments, and returns a JSON-serialisable dict."""
from __future__ import annotations
import json
from typing import Any, Awaitable, Callable
from . import db
from .bus import hub
from .config import settings
from .strada import strada
from .agents.base import AgentRun, case_changed, post

ASSISTANT = "Strada Pay assistant"

# ---- specs (Anthropic input_schema format; the ElevenLabs script converts them) ----
SPECS: list[dict] = [
    dict(name="verify_identity", description="Verify the employee before discussing pay details or changing anything. Ask for the last four digits of their SSN, or the six-digit code sent to their phone on file.",
         input_schema=dict(type="object", properties=dict(ssn_last4=dict(type="string", description="Last four digits of SSN, if given"), otp=dict(type="string", description="Six-digit code read back by the employee, if given")), required=[])),
    dict(name="get_payment_status", description="Get the employee's most recent pay: amount, pay date, method, whether it was paid, pending, or returned by the bank (with the return code and reason), and any open case about it. Requires verified identity.",
         input_schema=dict(type="object", properties={}, required=[])),
    dict(name="explain_payslip", description="Get the most recent payslip with every earning, tax and deduction line, the net amount, and a line-by-line comparison against the previous payslip so differences can be explained. Requires verified identity.",
         input_schema=dict(type="object", properties={}, required=[])),
    dict(name="update_bank_details", description="Update the employee's direct deposit bank account after they confirm the new routing and account numbers. Requires verified identity. Read the numbers back before calling.",
         input_schema=dict(type="object", properties=dict(routing=dict(type="string", description="9-digit ABA routing number"), account=dict(type="string", description="Account number")), required=["routing", "account"])),
    dict(name="create_case", description="Open a support case for the employee so Strada Payroll Support follows up. Call this when the issue needs action by payroll (a returned payment, a missing document, a correction) or the employee asks for a record of the request.",
         input_schema=dict(type="object", properties=dict(summary=dict(type="string", description="One or two sentences describing the issue and what has been established so far")), required=["summary"])),
    dict(name="transfer_to_representative", description="Hand the conversation to a human payroll representative with full context. Use when the employee asks for a person, when the issue needs a decision you cannot make (issuing a live check, a correction), or when the employee is upset. Tell the employee you are transferring them before calling this.",
         input_schema=dict(type="object", properties=dict(reason=dict(type="string", description="Why the handover is needed, for the representative")), required=["reason"])),
]
SPEC_BY_NAME = {s["name"]: s for s in SPECS}

# ---- helpers ----
async def _contact(conv: dict) -> dict:
    return await db.one("select c.*, a.name as account_name from contacts c join accounts a on a.id = c.account_id where c.id = %s", conv["customer_id"])

def _need_verify(conv: dict) -> dict | None:
    return None if conv.get("verified") else dict(error="identity_not_verified", say="I need to verify your identity first. Could you give me the last four digits of your Social Security number, or the six-digit code I sent to your phone?")

def _money(v) -> str:
    try: return f"${float(v):,.2f}"
    except Exception: return str(v)

# ---- tools ----
async def verify_identity(conv: dict, a: dict) -> dict:
    ct = await _contact(conv)
    res = await strada.verify(ct["employee_id"], ssn_last4=a.get("ssn_last4"), otp=a.get("otp"))
    ok = bool(res.get("verified"))
    if ok:
        await db.execute("update conversations set verified = true, verify_method = %s where id = %s", res.get("method"), conv["id"])
        conv["verified"] = True
    return dict(verified=ok, method=res.get("method"), employee_name=ct["name"], employer=ct["account_name"]) if ok else dict(verified=False, say="That didn't match what we have on file. Could you try again?")

async def get_payment_status(conv: dict, a: dict) -> dict:
    if (e := _need_verify(conv)): return e
    ct = await _contact(conv)
    pay = await strada.payment_status(ct["employee_id"])
    open_cases = await db.fetch("select number, title, status from cases where customer_id = %s and status <> 'Resolved' order by created_on desc limit 3", ct["id"])
    out = dict(pay_date=pay.get("pay_date"), amount=_money(pay.get("amount")), method=pay.get("method"), status=pay.get("status"),
               return_code=pay.get("return_code"), return_reason=pay.get("return_reason"), remedy=pay.get("remedy"),
               bank_on_file=(await strada.employee(ct["employee_id"])).get("bank", {}).get("account_masked"),
               open_cases=[dict(number=c["number"], title=c["title"], status=c["status"]) for c in open_cases])
    if open_cases and not conv.get("case_id"):   # an open case already covers this: link the conversation to it instead of opening another
        first = await db.one("select id, number, intent from cases where number = %s", open_cases[0]["number"])
        await db.execute("update conversations set case_id = %s, intent = coalesce(intent, %s) where id = %s", first["id"], first["intent"], conv["id"])
        conv["case_id"] = first["id"]; out["linked_case"] = first["number"]
        await post(first["id"], ASSISTANT, f"Employee contacted Strada Pay by {conv['channel']}", f"{ct['name']} asked about this payment through the Strada Pay assistant; the conversation is linked to this case.")
        await case_changed(first["id"])
    if pay.get("status") == "returned":
        out["explanation"] = f"The bank returned the deposit with code {pay.get('return_code')} ({pay.get('return_reason')}). The money is back with Strada and has not been lost."
        out["options"] = ["re-send the deposit after the employee corrects the account number in Strada Pay", "a live check by courier (a representative has to approve this)"]
    return out

async def explain_payslip(conv: dict, a: dict) -> dict:
    if (e := _need_verify(conv)): return e
    ct = await _contact(conv)
    slips = await strada.payslips(ct["employee_id"], limit=2)
    if not slips: return dict(error="no_payslips")
    cur, prev = slips[0], (slips[1] if len(slips) > 1 else None)
    def lines(s): return {l.get("code") or l.get("label"): l for l in s.get("lines", [])}
    cl, pl = lines(cur), lines(prev) if prev else {}
    diffs = []
    for code, l in cl.items():
        before = (pl.get(code) or {}).get("amount")
        if before is None and prev: diffs.append(dict(line=l.get("label"), kind=l.get("kind"), change="new", amount=_money(l["amount"])))
        elif before is not None and abs(float(before) - float(l["amount"])) >= 0.01: diffs.append(dict(line=l.get("label"), kind=l.get("kind"), before=_money(before), after=_money(l["amount"]), change=_money(float(l["amount"]) - float(before))))
    for code, l in pl.items():
        if code not in cl: diffs.append(dict(line=l.get("label"), kind=l.get("kind"), change="removed", amount=_money(l["amount"])))
    return dict(pay_date=cur.get("pay_date"), gross=_money(cur.get("gross")), net=_money(cur.get("net")), hours=cur.get("hours"),
                lines=[dict(label=l.get("label"), kind=l.get("kind"), amount=_money(l.get("amount"))) for l in cur.get("lines", [])],
                previous=dict(pay_date=prev.get("pay_date"), gross=_money(prev.get("gross")), net=_money(prev.get("net")), hours=prev.get("hours")) if prev else None,
                differences=diffs or ["no line changed versus the previous payslip"])

async def update_bank_details(conv: dict, a: dict) -> dict:
    if (e := _need_verify(conv)): return e
    ct = await _contact(conv)
    routing, account = str(a.get("routing", "")).strip(), str(a.get("account", "")).strip()
    if len(routing) != 9 or not routing.isdigit(): return dict(error="invalid_routing", say="A routing number has nine digits. Could you read it to me again?")
    if len(account) < 4 or not account.isdigit(): return dict(error="invalid_account", say="That account number doesn't look right. Could you read it again?")
    res = await strada.update_bank(ct["employee_id"], routing, account)
    if res.get("error"): return dict(error=res["error"])
    await db.emit("employee.bank_updated", dict(contact_id=ct["id"], employee_id=ct["employee_id"], by=ASSISTANT, channel=conv["channel"]), "strada-pay")
    for c in await db.fetch("select id from cases where customer_id = %s and status <> 'Resolved' and intent = 'Pay not received – bank return'", ct["id"]):
        await post(c["id"], ASSISTANT, "Bank details updated by the employee", f"The employee updated their direct deposit account (now ending {account[-4:]}) through Strada Pay {conv['channel']}. The returned deposit can be re-sent.")
        await case_changed(c["id"])
    return dict(updated=True, account_masked=res.get("account_masked") or f"••••{account[-4:]}", effective="next payment run", say="Done — the new account is on file and will be used for the next payment.")

async def create_case(conv: dict, a: dict) -> dict:
    from .agents import case_management as cm
    ct = await _contact(conv)
    if conv.get("case_id"):
        case = await db.one("select number, title, status from cases where id = %s", conv["case_id"])
        return dict(already_open=True, number=case["number"], title=case["title"], status=case["status"])
    lines = await db.fetch("select who, text from transcript_lines where conversation_id = %s order by id", conv["id"])
    text = "\n".join(f"{l['who']}: {l['text']}" for l in lines) or a.get("summary", "")
    source = "voice" if conv["channel"] == "voice" else "chat"
    case = await cm.create_from(source, ct["id"], text, a.get("summary", "")[:80], conv["id"])
    conv["case_id"] = case["id"]
    return dict(created=True, number=case["number"], title=case["title"], priority=case["priority"], queue=case["queue_id"], say=f"I've opened case {case['number']} for you.")

async def transfer_to_representative(conv: dict, a: dict) -> dict:
    ct = await _contact(conv)
    case = await db.one("select * from cases where id = %s", conv["case_id"]) if conv.get("case_id") else None
    intent = (case or {}).get("intent") or conv.get("intent") or ""
    queue = await _queue_for(intent)
    now = db.now()
    row = await db.update("conversations", conv["id"], dict(state="Open", queue_id=queue["id"], started_at=now, waiting_seconds=0, transferred_by=ASSISTANT, transfer_reason=a.get("reason", ""), handled_by_assistant=True, intent=intent or None))
    await hub.broadcast("conversation.updated", row)
    await db.emit("conversation.transferred", dict(conversation_id=conv["id"], queue_id=queue["id"], case_id=conv.get("case_id"), reason=a.get("reason", "")), "strada-pay")
    conv.update(row)
    return dict(transferred=True, queue=queue["name"], case=(case or {}).get("number"), say="I'm transferring you to a payroll specialist now and passing along everything we've discussed. Please hold.")

async def announce_transfer(conv: dict):
    """The 'Transferred to queue … with context' system line. Callers add it after the assistant's last words so the transcript reads in order."""
    q = await db.one("select name from queues where id = %s", conv.get("queue_id")) or dict(name="Pay Distribution")
    line = await db.insert("transcript_lines", dict(conversation_id=conv["id"], who="System", text=f"Transferred to queue {q['name']} with context. Waiting for a representative."))
    await hub.broadcast("transcript.line", line)

async def _queue_for(intent: str) -> dict:
    from .agents.case_management import INTENTS
    qid = INTENTS.get(intent, INTENTS["Unclassified"])[1] if intent in INTENTS else "q1"
    return await db.one("select * from queues where id = %s", qid) or await db.one("select * from queues order by id limit 1")

IMPL: dict[str, Callable[[dict, dict], Awaitable[dict]]] = dict(
    verify_identity=verify_identity, get_payment_status=get_payment_status, explain_payslip=explain_payslip,
    update_bank_details=update_bank_details, create_case=create_case, transfer_to_representative=transfer_to_representative)

async def call(conv: dict, name: str, args: dict, run: AgentRun | None = None) -> dict:
    """Execute a tool against a conversation; logs to the conversation's agent run and streams to the workspace."""
    fn = IMPL.get(name)
    if not fn: return dict(error=f"unknown tool {name}")
    try: out = await fn(conv, args or {})
    except Exception as e: out = dict(error=str(e)[:300])
    if run: await run.tool(f"strada-pay.{name}", args or {}, out)
    return out
