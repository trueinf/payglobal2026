"""Day-7 Resolution Verifier — a resolved case is not finished until the money actually landed.
Seven days (demo clock) after a bank-return case is resolved, it checks Strada payments: settled → confirms, tells the employee, closes the loop;
not settled → reopens the case at High priority with the facts, so nobody finds out from a second call."""
from __future__ import annotations
import json
from datetime import datetime, timedelta
from .. import db, llm
from ..bus import hub
from ..config import settings
from ..strada import strada
from .base import AgentRun, post, case_changed
from .sentinel import alert

AGENT = "Day-7 Resolution Verifier"
HANDLES = ("clock.advanced", "case.resolved", "payment.remedy_arranged")
VERIFY_INTENTS = {"Pay not received – bank return"}

SYSTEM = "You are the Day-7 Resolution Verifier for Strada Payroll Support. Write a two-sentence employee message and a one-line case note from the facts given. Amounts in dollars and cents. No promises beyond the facts."
SCHEMA = dict(type="object", required=["employee_message", "note"], properties=dict(employee_message=dict(type="string"), note=dict(type="string")))

async def handle(ev: dict):
    if ev["type"] == "case.resolved": await on_resolved(ev["payload"])
    elif ev["type"] == "clock.advanced": await sweep()

async def on_resolved(p: dict):
    """Record the remedy in Strada payments and schedule the day-7 check as an agent-owned task on the timeline."""
    case = await db.one("select c.*, ct.employee_id, ct.name as customer_name from cases c join contacts ct on ct.id = c.customer_id where c.id = %s", p.get("case_id"))
    if not case or case["intent"] not in VERIFY_INTENTS: return
    now = await db.demo_now()
    text = f"{p.get('remarks') or ''} {case.get('resolution') or ''} {case.get('description') or ''}".lower()
    kind = "live_check" if ("check" in text and "redeposit" not in text and "re-deposit" not in text) else "redeposit"
    async with AgentRun(AGENT, "event", "case", case["id"], dict(resolution=case.get("resolution"), remedy=kind)) as run:
        await run.step("schedule", f"remedy {kind} recorded; verification due in 7 days")
        rem = await strada._send("POST", f"/pay/payments/{case['employee_id']}/remedy", json=dict(type=kind, as_of=now.isoformat(), requested_by=AGENT))
        await run.tool("strada.payment_remedy", dict(employee_id=case["employee_id"], type=kind), rem)
        due = (now + timedelta(days=7)).replace(hour=10, minute=0, second=0, microsecond=0)
        await db.update("cases", case["id"], dict(remedy=rem if not rem.get("error") else dict(type=kind)))
        await db.insert("activities", dict(id=db.new_id("t"), case_id=case["id"], type="task", from_name=AGENT, agent=AGENT, subject="Day-7 check: confirm the payment settled", body=f"Remedy: {kind.replace('_', ' ')} · expected settlement {rem.get('expected_settlement', 'tbc')}. The verifier checks Strada payments on the due date and reopens the case if the money has not landed.", status="Open", due=due, ai_generated=True, at=now, modified_at=now))
        run.output = dict(case_id=case["id"], remedy=kind, due=due.isoformat())
        await case_changed(case["id"])

async def sweep():
    """Every resolved bank-return case whose day-7 has arrived on the demo clock."""
    now = await db.demo_now()
    due = await db.fetch("""select c.*, ct.employee_id, ct.name as customer_name from cases c join contacts ct on ct.id = c.customer_id
        where c.status = 'Resolved' and c.verified_at is null and c.intent = any(%s) and c.resolved_on is not null and c.resolved_on + interval '7 days' <= %s
          and (c.verification is null or (c.verification->>'next_check') is null or (c.verification->>'next_check') <= %s)""", list(VERIFY_INTENTS), now, now.date().isoformat())
    for case in due: await verify(case, now)

async def verify(case: dict, now):
    async with AgentRun(AGENT, "scheduled", "case", case["id"], dict(resolved_on=str(case.get("resolved_on")), remedy=(case.get("remedy") or {}).get("type"))) as run:
        await run.step("verify", f"checking Strada payments for {case['customer_name']} as of {now.date()}")
        pay = await strada._get(f"/pay/payments/{case['employee_id']}", as_of=now.isoformat())
        await run.tool("strada.payment_status", dict(employee_id=case["employee_id"], as_of=now.date().isoformat()), pay)
        rem = pay.get("remedy") or {}
        settled = pay.get("status") == "paid" and (rem.get("status") == "settled" or not rem)
        if settled and not rem: rem = dict(type=(case.get("remedy") or {}).get("type", "payment"), status="settled", settled_at=(pay.get("settled_at") or "")[:10])
        expected = rem.get("expected_settlement") or ""
        on_track = (not settled) and rem.get("status") != "failed" and bool(expected) and expected > now.date().isoformat()
        amount = float(pay.get("amount") or 0)
        facts = f"Employee {case['customer_name']} · case {case['number']} resolved {str(case.get('resolved_on'))[:10]} with {rem.get('type', 'a remedy')} · today {now.date()} · payment status {pay.get('status')} · remedy {json.dumps(rem, default=str)} · amount {amount:,.2f}"
        if settled:
            def fb(): return dict(employee_message=f"Good news — your payment of ${amount:,.2f} settled on {rem.get('settled_at')} via {rem.get('type', '').replace('_', ' ')}. Case {case['number']} is now complete; nothing more is needed from you.", note=f"Day-7 check: ${amount:,.2f} settled {rem.get('settled_at')} via {rem.get('type')}. Verified against Strada payments.")
            out, model = await llm.structured("day7_ok", SYSTEM, facts, SCHEMA, fallback=fb)
            await run.tool("claude.structured", dict(model=model, task="day7_ok"), out)
            await db.update("cases", case["id"], dict(verified_at=now, verification=dict(outcome="settled", checked_at=now.isoformat(), detail=out["note"])))
            await post(case["id"], AGENT, "Day-7 verification: payment settled", out["note"])
            await _close_task(case["id"], "Completed")
            a = await alert(case["customer_id"], case["account_id"], "status_update", "Your payment has settled", out["employee_message"], case["id"], channel="sms+app", agent=AGENT)
            await run.tool("alerts.send", dict(contact=case["customer_name"]), dict(id=a["id"]))
            run.output = dict(case_id=case["id"], number=case["number"], outcome="settled")
        elif on_track:
            def fb(): return dict(employee_message=f"A quick update: your {rem.get('type', '').replace('_', ' ')} of ${amount:,.2f} is scheduled to settle on {expected}. Case {case['number']} stays open on our side until we confirm it landed.", note=f"Day-7 check: {rem.get('type')} scheduled for {expected}; on track. Next check on {expected}.")
            out, model = await llm.structured("day7_ontrack", SYSTEM, facts, SCHEMA, fallback=fb)
            await run.tool("claude.structured", dict(model=model, task="day7_ontrack"), out)
            await db.update("cases", case["id"], dict(verification=dict(outcome="on_track", checked_at=now.isoformat(), detail=out["note"], next_check=expected)))
            await post(case["id"], AGENT, "Day-7 verification: remedy on track", out["note"])
            nxt = datetime.fromisoformat(expected).replace(hour=10, minute=0, tzinfo=now.tzinfo)
            for t in await db.fetch("select id from activities where case_id = %s and agent = %s and type = 'task' and status = 'Open'", case["id"], AGENT):
                row = await db.update("activities", t["id"], dict(due=nxt, body=f"Rescheduled: remedy expected to settle {expected}.", modified_at=db.now())); await hub.broadcast("activity.updated", row)
            a = await alert(case["customer_id"], case["account_id"], "status_update", "Your payment is on track", out["employee_message"], case["id"], channel="sms+app", agent=AGENT)
            await run.tool("alerts.send", dict(contact=case["customer_name"]), dict(id=a["id"]))
            run.output = dict(case_id=case["id"], number=case["number"], outcome="on_track", next_check=expected)
        else:
            def fb(): return dict(employee_message=f"We checked on your payment of ${amount:,.2f} and it has not yet reached your account. We have reopened case {case['number']} and a payroll specialist will contact you today.", note=f"Day-7 check: remedy {rem.get('type', 'unknown')} not settled (status {rem.get('status') or pay.get('status')}). Case reopened at High priority.")
            out, model = await llm.structured("day7_reopen", SYSTEM, facts, SCHEMA, fallback=fb)
            await run.tool("claude.structured", dict(model=model, task="day7_reopen"), out)
            await db.update("cases", case["id"], dict(status="In Progress", priority="High", escalated=True, escalated_on=now, resolved_on=None, verification=dict(outcome="reopened", checked_at=now.isoformat(), detail=out["note"]), ai_updated=True, ai_fields=sorted(set(case["ai_fields"] or []) | {"status", "priority", "escalated"}), resolve_by=now + timedelta(days=1), highlights=(case["highlights"] or []) + ["Reopened by the Day-7 Resolution Verifier: remedy not settled"]))
            await post(case["id"], AGENT, "Day-7 verification: payment not settled – case reopened", out["note"])
            await _close_task(case["id"], "Completed")
            a = await alert(case["customer_id"], case["account_id"], "status_update", "We are following up on your payment", out["employee_message"], case["id"], channel="sms+app", agent=AGENT)
            await run.tool("alerts.send", dict(contact=case["customer_name"]), dict(id=a["id"]))
            await db.emit("case.reopened", dict(case_id=case["id"], by=AGENT, reason="remedy not settled"))
            run.output = dict(case_id=case["id"], number=case["number"], outcome="reopened")
        await case_changed(case["id"])

async def _close_task(case_id: str, status: str):
    for t in await db.fetch("select id from activities where case_id = %s and agent = %s and type = 'task' and status = 'Open'", case_id, AGENT):
        row = await db.update("activities", t["id"], dict(status=status, modified_at=db.now()))
        await hub.broadcast("activity.updated", row)
