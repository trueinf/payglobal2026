"""Pay Event Sentinel — watches the pay-event stream and acts before anyone calls.
ach.return_posted            → tell the employee, open the case, hand it to Pay Distribution
timesheet.unapproved_at_cutoff → warn the client payroll contact and the managers, open a processing case before the run fails
Every action is a timeline entry, an alert the employee sees in Strada Pay, and an agent run the workspace can show."""
from __future__ import annotations
import json, random
from .. import db, llm
from ..bus import hub
from ..config import settings
from ..strada import strada
from .base import AgentRun, post, case_changed

AGENT = "Pay Event Sentinel"
HANDLES = ("ach.return_posted", "timesheet.unapproved_at_cutoff")

SYSTEM = """You are the Pay Event Sentinel for Strada Payroll Support. A pay event has just arrived from the bank or the time system.
Write what the affected person should be told — plain, calm, specific, no jargon, two sentences at most — and a one-line case description for payroll.
Never promise a date you were not given. Amounts in dollars and cents.
For a bank return: say the money is safe and a case is open, that payroll will confirm the cause today, and that they do not need to change anything yet (several returns at once are usually a bank-side issue, not the employee's details).
Case titles follow the support convention: "Pay not received – direct deposit returned (<code>)" or "Timesheet cut-off: <n> unapproved in <pay group>"."""

ALERT_SCHEMA = dict(type="object", required=["employee_message", "case_title", "case_description", "priority"], properties=dict(
    employee_message=dict(type="string", description="SMS/app notification to the employee (or client contact)"),
    case_title=dict(type="string"), case_description=dict(type="string"),
    priority=dict(type="string", enum=["High", "Normal", "Low"])))

async def alert(contact_id: str | None, account_id: str | None, kind: str, title: str, message: str, case_id: str | None = None, channel: str = "app", agent: str | None = None) -> dict:
    row = await db.insert("alerts", dict(contact_id=contact_id, account_id=account_id, kind=kind, channel=channel, title=title, message=message, related_case_id=case_id, agent=agent or AGENT, sent_at=await db.demo_now()))
    await hub.broadcast("alert.created", row)
    return row

async def handle(ev: dict):
    if ev["type"] == "ach.return_posted": await on_ach_return(ev)
    elif ev["type"] == "timesheet.unapproved_at_cutoff": await on_timesheet_cutoff(ev)

async def on_ach_return(ev: dict):
    p = ev["payload"]
    contact = await db.one("select c.*, a.name as account_name from contacts c join accounts a on a.id = c.account_id where c.id = %s or c.employee_id = %s", p.get("contact_id") or "", p.get("employee_id") or "")
    if not contact: return
    async with AgentRun(AGENT, "event", "contact", contact["id"], dict(event=ev["type"], employee_id=p.get("employee_id"), code=p.get("return_code"))) as run:
        await run.step("detect", f"bank return {p.get('return_code')} for {contact['name']}")
        existing = await db.one("select id, number from cases where customer_id = %s and status <> 'Resolved' and intent = 'Pay not received – bank return' order by created_on desc limit 1", contact["id"])
        emp = await strada.employee(contact["employee_id"]); await run.tool("strada.employee", dict(employee_id=contact["employee_id"]), dict(bank=emp.get("bank")))
        amount = float(p.get("amount") or 0)
        def fb():
            return dict(employee_message=f"Your pay of ${amount:,.2f} dated {p.get('pay_date')} was returned by your bank ({p.get('return_code')}). It has not been lost — Strada Payroll Support has opened a case and will contact you today. You can check or update your bank details in Strada Pay.",
                        case_title=f"Pay not received – direct deposit returned ({p.get('return_code')})", case_description=f"ACH return {p.get('return_code')} ({p.get('return_reason')}) for {contact['employee_id']}, amount {amount:,.2f}, pay date {p.get('pay_date')}, trace {p.get('trace')}. Detected by the Pay Event Sentinel before the employee contacted support.", priority="High")
        out, model = await llm.structured("sentinel_ach", SYSTEM, f"Event: {json.dumps(p, default=str)}\nEmployee: {contact['name']} · {contact['account_name']} · pay group {contact['pay_group']}\nBank on file: {json.dumps(emp.get('bank'))}\nExisting open case: {existing['number'] if existing else 'none'}", ALERT_SCHEMA, fallback=fb)
        await run.tool("claude.structured", dict(model=model, task="sentinel_ach"), out)
        if existing:
            case_id = existing["id"]
            await post(case_id, AGENT, f"Bank return {p.get('return_code')} posted", f"The bank return file confirms {p.get('return_code')} ({p.get('return_reason')}) for ${amount:,.2f}, trace {p.get('trace')}.")
        else:
            n = random.randint(10500, 10999); case_id = db.new_id("k")
            await db.insert("cases", dict(id=case_id, number=f"CAS-{n}-{case_id[-4:].upper()}", title=out["case_title"], customer_id=contact["id"], account_id=contact["account_id"], subject="Pay distribution", priority=out.get("priority", "High"), status="In Progress", origin="Web", type="Problem", product="US Payroll – Direct Deposit", description=out["case_description"], owner=settings.owner, queue_id="q1", intent="Pay not received – bank return", script_id="s1", ai_created=True, ai_fields=["title", "subject", "priority", "type", "product", "description"], suggestions_pending=True, created_by=AGENT, first_response_sent=False, summary=f"{contact['name']}'s direct deposit of ${amount:,.2f} was returned ({p.get('return_code')}). The Pay Event Sentinel opened this case from the bank return file and notified the employee before they called.", highlights=[f"ACH return {p.get('return_code')} · ${amount:,.2f} · trace {p.get('trace')}", "Employee notified through Strada Pay by the Pay Event Sentinel", "Opened proactively — no inbound contact yet"], resolve_by=(await db.demo_now()).replace(hour=17, minute=0, second=0, microsecond=0), created_on=await db.demo_now()))
            await run.tool("db.cases.insert", dict(title=out["case_title"]), dict(id=case_id))
            await post(case_id, AGENT, "Case opened from bank return file", f"Return {p.get('return_code')} ({p.get('return_reason')}) for ${amount:,.2f}, trace {p.get('trace')}. Opened before any contact from the employee.")
            await db.emit("case.created", dict(case_id=case_id, intent="Pay not received – bank return", contact_id=contact["id"], account_id=contact["account_id"], pay_group=contact["pay_group"], source="sentinel", return_code=p.get("return_code"), routing=p.get("routing") or emp.get("bank", {}).get("routing")))
        a = await alert(contact["id"], contact["account_id"], "ach_return", "Your deposit was returned", out["employee_message"], case_id, channel="sms+app")
        await run.tool("alerts.send", dict(contact=contact["name"], channel="sms+app"), dict(id=a["id"]))
        await post(case_id, AGENT, "Employee notified", f"Sent to {contact['name']} by SMS and Strada Pay: “{out['employee_message']}”")
        await db.update("cases", case_id, dict(first_response_sent=True))
        run.output = dict(case_id=case_id, number=(await db.one("select number from cases where id = %s", case_id))["number"], proactive=not existing, alert_id=a["id"])
        await case_changed(case_id)

async def on_timesheet_cutoff(ev: dict):
    p = ev["payload"]
    lead = await db.one("select c.*, a.name as account_name from contacts c join accounts a on a.id = c.account_id where c.id = %s", p.get("client_contact_id") or "") \
        or await db.one("select c.*, a.name as account_name from contacts c join accounts a on a.id = c.account_id where c.account_id = %s and c.role = 'client_lead' limit 1", p.get("account_id"))
    if not lead: return
    async with AgentRun(AGENT, "event", "contact", lead["id"], dict(event=ev["type"], pay_group=p.get("pay_group"), unapproved=p.get("unapproved"))) as run:
        await run.step("detect", f"{p.get('unapproved')} unapproved timesheets at cut-off for {p.get('pay_group')}")
        cal = await strada.pay_calendar(p.get("pay_group")); await run.tool("strada.pay_calendar", dict(pay_group=p.get("pay_group")), cal)
        def fb():
            return dict(employee_message=f"{p.get('unapproved')} {p.get('pay_group')} timesheets ({p.get('hours')} hours) are still unapproved at today's cut-off. If they are not approved by 5 PM, those employees will be underpaid on {p.get('next_pay_date')}. Managers: {', '.join(p.get('managers', []))}.",
                        case_title=f"Timesheet cut-off: {p.get('unapproved')} unapproved in {p.get('pay_group')}", case_description=f"At the {p.get('cutoff')} cut-off, {p.get('unapproved')} timesheets in {p.get('pay_group')} ({p.get('client')}) totalling {p.get('hours')} hours are unapproved. Pay date {p.get('next_pay_date')}. Managers: {', '.join(p.get('managers', []))}. Raised by the Pay Event Sentinel before the import ran.", priority="High")
        out, model = await llm.structured("sentinel_cutoff", SYSTEM, f"Event: {json.dumps({k: v for k, v in p.items() if k != 'employees'}, default=str)}\nClient payroll contact: {lead['name']} ({lead['account_name']})\nPay calendar: {json.dumps(cal, default=str)}", ALERT_SCHEMA, fallback=fb)
        await run.tool("claude.structured", dict(model=model, task="sentinel_cutoff"), out)
        n = random.randint(10500, 10999); case_id = db.new_id("k")
        await db.insert("cases", dict(id=case_id, number=f"CAS-{n}-{case_id[-4:].upper()}", title=out["case_title"], customer_id=lead["id"], account_id=lead["account_id"], subject="Ongoing processing", priority=out.get("priority", "High"), status="In Progress", origin="Web", type="Problem", product="US Payroll – Time & Attendance", description=out["case_description"], owner=settings.owner, queue_id="q3", intent="Timesheet cut-off", ai_created=True, ai_fields=["title", "subject", "priority", "type", "product", "description"], suggestions_pending=True, created_by=AGENT, first_response_sent=True, summary=f"{p.get('unapproved')} unapproved {p.get('pay_group')} timesheets at cut-off; {lead['name']} and the managers were warned by the Pay Event Sentinel before the pay run.", highlights=[f"{p.get('unapproved')} timesheets · {p.get('hours')} hours · managers {', '.join(p.get('managers', []))}", f"Pay date {p.get('next_pay_date')} at risk", "Client contact notified; no employee impact yet"], resolve_by=(await db.demo_now()).replace(hour=17, minute=0, second=0, microsecond=0), created_on=await db.demo_now()))
        await run.tool("db.cases.insert", dict(title=out["case_title"]), dict(id=case_id))
        await post(case_id, AGENT, "Unapproved timesheets at cut-off", "\n".join(f"{e['name']} ({e['employee_id']}) · {e['hours']} h" for e in p.get("employees", [])[:14]))
        a = await alert(lead["id"], lead["account_id"], "timesheet_reminder", f"{p.get('unapproved')} timesheets unapproved at cut-off", out["employee_message"], case_id, channel="email+app")
        await run.tool("alerts.send", dict(contact=lead["name"], managers=p.get("managers")), dict(id=a["id"]))
        await post(case_id, AGENT, "Client and managers notified", f"Sent to {lead['name']} and {', '.join(p.get('managers', []))}: “{out['employee_message']}”")
        await db.emit("case.created", dict(case_id=case_id, intent="Timesheet cut-off", contact_id=lead["id"], account_id=lead["account_id"], pay_group=p.get("pay_group"), source="sentinel"))
        run.output = dict(case_id=case_id, number=(await db.one("select number from cases where id = %s", case_id))["number"], unapproved=p.get("unapproved"), alert_id=a["id"])
        await case_changed(case_id)
