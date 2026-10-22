"""Incident Clustering — when several cases of the same kind land for one client pay group in a short window,
it links them under one incident case, works out the likely common cause from the data, and tells the client payroll lead once —
instead of four representatives discovering the same thing four times."""
from __future__ import annotations
import asyncio, json, random
from datetime import timedelta
from .. import db, llm
from ..bus import hub
from ..config import settings
from ..strada import strada
from .base import AgentRun, post, case_changed
from .sentinel import alert

AGENT = "Incident Clustering Agent"
HANDLES = ("case.created",)
THRESHOLD = 3
WINDOW_HOURS = 6
CLUSTERABLE = {"Pay not received – bank return"}

SYSTEM = """You are the Incident Clustering Agent for Strada Payroll Support. Several employee cases of the same kind have arrived for one client pay group.
Decide the most likely common cause from the data (bank routing numbers, return codes, what the unaffected employees have in common or not), say how confident you are,
and write a short incident summary, a concrete action plan for payroll, and a two-sentence message to the client's payroll lead. Facts only; name the evidence.
The client message and the employee action must follow from the root cause: if the cause is bank-side (one routing number, different accounts), say Strada is handling it and employees need not resubmit anything; only ask for new bank forms when the evidence points at individual account errors."""

SCHEMA = dict(type="object", required=["title", "summary", "root_cause", "confidence", "action_plan", "client_message"], properties=dict(
    title=dict(type="string", description="Incident title, e.g. 'Incident: BW-OPS bank returns (R04) – routing 021200339'"),
    summary=dict(type="string"), root_cause=dict(type="string", description="Most likely common cause, with the evidence"),
    confidence=dict(type="string", enum=["Low", "Medium", "High"]),
    action_plan=dict(type="array", items=dict(type="string"), description="3-5 concrete steps for payroll, in order"),
    client_message=dict(type="string"), employee_action=dict(type="string", description="What, if anything, affected employees must do themselves")))

_locks: dict[str, asyncio.Lock] = {}

async def handle(ev: dict):
    p = ev["payload"]
    if p.get("intent") not in CLUSTERABLE or not p.get("case_id"): return
    case = await db.one("select * from cases where id = %s", p["case_id"])
    if not case or case.get("parent_id"): return
    contact = await db.one("select * from contacts where id = %s", case["customer_id"])
    key = f"{case['account_id']}:{contact['pay_group']}"
    lock = _locks.setdefault(key, asyncio.Lock())
    async with lock:   # events for the same pay group arrive together; cluster them one at a time
        await _cluster(case, contact)

async def _cluster(case: dict, contact: dict):
    since = (await db.demo_now()) - timedelta(hours=WINDOW_HOURS)
    siblings = await db.fetch("""select c.*, ct.name as customer_name, ct.employee_id, ct.pay_group from cases c join contacts ct on ct.id = c.customer_id
        where c.account_id = %s and ct.pay_group = %s and c.intent = %s and c.status <> 'Resolved' and c.created_on >= %s and (c.incident is null) order by c.created_on""", case["account_id"], contact["pay_group"], case["intent"], since)
    if len(siblings) < THRESHOLD: return
    incident = await db.one("select * from cases where account_id = %s and incident is not null and incident->>'pay_group' = %s and status <> 'Resolved' order by created_on desc limit 1", case["account_id"], contact["pay_group"])
    unlinked = [s for s in siblings if not s.get("parent_id")]
    if incident and not unlinked: return
    async with AgentRun(AGENT, "event", "case", (incident or {}).get("id") or case["id"], dict(account_id=case["account_id"], pay_group=contact["pay_group"], cases=[s["number"] for s in siblings])) as run:
        await run.step("cluster", f"{len(siblings)} {case['intent']} cases in {contact['pay_group']} within {WINDOW_HOURS} h")
        # evidence: bank details of affected vs unaffected employees in the pay group
        affected, unaffected = [], []
        for s in siblings:
            e = await strada.employee(s["employee_id"]); pay = await strada.payment_status(s["employee_id"])
            affected.append(dict(case=s["number"], employee=s["customer_name"], employee_id=s["employee_id"], routing=e.get("bank", {}).get("routing"), account_last4=e.get("bank", {}).get("account_last4"), code=pay.get("return_code"), amount=pay.get("amount")))
        for c in await db.fetch("select * from contacts where account_id = %s and pay_group = %s and id <> all(%s)", case["account_id"], contact["pay_group"], [s["customer_id"] for s in siblings]):
            try:
                e = await strada.employee(c["employee_id"]); pay = await strada.payment_status(c["employee_id"])
                unaffected.append(dict(employee=c["name"], routing=e.get("bank", {}).get("routing"), payment=pay.get("status")))
            except Exception: pass
        await run.tool("strada.employee+payment_status", dict(affected=len(affected), unaffected=len(unaffected)), dict(affected=affected, unaffected=unaffected))
        account = await db.one("select * from accounts where id = %s", case["account_id"])
        lead = await db.one("select * from contacts where id = %s", account.get("payroll_lead_contact_id") or "") or await db.one("select * from contacts where account_id = %s and role = 'client_lead' limit 1", case["account_id"])
        def fb():
            routings = {a["routing"] for a in affected}; code = affected[0]["code"]
            same = len(routings) == 1
            return dict(title=f"Incident: {contact['pay_group']} bank returns ({code})" + (f" – routing {next(iter(routings))}" if same else ""),
                        summary=f"{len(affected)} {account['name']} employees in {contact['pay_group']} had direct deposits returned with {code} on the same pay date.",
                        root_cause=(f"All {len(affected)} returned accounts use routing {next(iter(routings))}; unaffected employees on other routings were paid. A change at that bank (merger or account-format change) is the most likely cause, not individual employee errors." if same else "No single routing number; likely a file-level issue in the ACH release."),
                        confidence="High" if same else "Medium", action_plan=["Confirm the bank change with Treasury", "Re-send all affected deposits with corrected details or issue live checks", "Update bank details for affected employees in one batch", "Add a pre-release routing check for this client"],
                        client_message=f"{len(affected)} {contact['pay_group']} employees had deposits returned ({code}) this morning; all share one bank routing number, so we believe this is a bank-side change rather than employee error. Strada is re-sending the payments and will confirm by 2 PM.", employee_action="None unless contacted; updating bank details is not required.")
        out, model = await llm.structured("incident", SYSTEM, f"Client: {account['name']} · pay group {contact['pay_group']}\nAffected: {json.dumps(affected, default=str)}\nUnaffected in the same pay group: {json.dumps(unaffected, default=str)}\nExisting incident: {incident['number'] if incident else 'none'}", SCHEMA, fallback=fb)
        await run.tool("claude.structured", dict(model=model, task="incident"), out)
        inc = dict(pay_group=contact["pay_group"], code=affected[0]["code"], affected=[a["case"] for a in affected], root_cause=out["root_cause"], confidence=out["confidence"], action_plan=out["action_plan"], employee_action=out.get("employee_action"), client_notified_at=None)
        if incident:
            inc["client_notified_at"] = (incident["incident"] or {}).get("client_notified_at")
            await db.update("cases", incident["id"], dict(incident=inc, summary=out["summary"], highlights=[f"{len(affected)} cases linked", f"Root cause ({out['confidence']}): {out['root_cause'][:120]}", f"Client lead notified"], ai_updated=True))
            inc_id = incident["id"]
        else:
            n = random.randint(10500, 10999); inc_id = db.new_id("k")
            await db.insert("cases", dict(id=inc_id, number=f"CAS-{n}-INC{inc_id[-2:].upper()}", title=out["title"], customer_id=(lead or contact)["id"], account_id=case["account_id"], subject="Pay distribution", priority="High", status="In Progress", origin="Web", type="Problem", product="US Payroll – Direct Deposit", description=out["summary"] + "\n\nRoot cause: " + out["root_cause"], owner=settings.owner, queue_id="q1", intent="Incident – bank returns", escalated=True, escalated_on=await db.demo_now(), ai_created=True, ai_fields=["title", "subject", "priority", "type", "description", "escalated"], suggestions_pending=True, created_by=AGENT, incident=inc, summary=out["summary"], highlights=[f"{len(affected)} cases linked by the Incident Clustering Agent", f"Root cause ({out['confidence']}): {out['root_cause'][:120]}", "Action plan posted; client lead notified once"], first_response_sent=True, resolve_by=(await db.demo_now()) + timedelta(days=1), created_on=await db.demo_now()))
            await run.tool("db.cases.insert", dict(number=f"CAS-{n}-INC{inc_id[-2:].upper()}"), dict(id=inc_id))
            await post(inc_id, AGENT, "Incident opened", out["summary"])
            await post(inc_id, AGENT, f"Likely root cause ({out['confidence']} confidence)", out["root_cause"])
            await post(inc_id, AGENT, "Action plan", "\n".join(f"{i+1}. {a}" for i, a in enumerate(out["action_plan"])), type_="task")
        inc_row = await db.one("select number from cases where id = %s", inc_id)
        for s in unlinked:
            await db.update("cases", s["id"], dict(parent_id=inc_id, ai_updated=True, ai_fields=sorted(set(s["ai_fields"] or []) | {"parent_id"})))
            await post(s["id"], AGENT, f"Linked to incident {inc_row['number']}", f"{len(affected)} {contact['pay_group']} cases share the same cause. {out['root_cause'][:160]}")
            await case_changed(s["id"])
        if lead and not inc["client_notified_at"]:
            a = await alert(lead["id"], case["account_id"], "status_update", f"Incident {inc_row['number']}: {contact['pay_group']} bank returns", out["client_message"], inc_id, channel="email+app", agent=AGENT)
            inc["client_notified_at"] = (await db.demo_now()).isoformat()
            await db.update("cases", inc_id, dict(incident=inc))
            await run.tool("alerts.send", dict(contact=lead["name"], channel="email+app"), dict(id=a["id"]))
            await post(inc_id, AGENT, f"Client payroll lead notified – {lead['name']}", out["client_message"])
        await db.emit("incident.updated" if incident else "incident.created", dict(case_id=inc_id, account_id=case["account_id"], pay_group=contact["pay_group"], affected=len(affected), root_cause=out["root_cause"]))
        run.output = dict(case_id=inc_id, number=inc_row["number"], affected=len(affected), confidence=out["confidence"])
        await case_changed(inc_id)
