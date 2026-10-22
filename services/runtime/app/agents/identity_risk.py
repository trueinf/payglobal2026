"""Identity & Risk Agent — verification that fits the risk of the request, not a fixed script.
Scores every sensitive action (bank-details change, address change, document reissue) from the signals on record:
how identity was verified, recent address or bank changes, failed attempts, channel, the pattern of the request.
Low → proceed; Medium → step-up (one-time code to the phone on file); High → hold the change and route to a representative.
Every assessment is on the conversation/case and in identity_events, so the representative sees why."""
from __future__ import annotations
import json
from datetime import timedelta
from .. import db, llm
from ..bus import hub
from ..strada import strada
from .base import AgentRun, post, case_changed

AGENT = "Identity & Risk Agent"

SYSTEM = """You are the Identity & Risk Agent for Strada Payroll Support. A sensitive action is being requested in an employee conversation.
Assess account-takeover and fraud risk from the signals only (no assumptions about the person). Classic patterns: address changed shortly before a bank change; a bank change right after a returned
payment to a new bank; several failed verifications; identity verified only by data that could be known to others (SSN last four) on a voice/chat channel; a request to send money somewhere new.
Decide the control: proceed, step_up (one-time code to the phone on file, then proceed), or hold (do not change; a representative calls the employee back on the number on file).
Explain in two sentences the representative can read, and give the employee one calm sentence."""

SCHEMA = dict(type="object", required=["risk", "control", "signals", "explanation", "employee_message"], properties=dict(
    risk=dict(type="string", enum=["Low", "Medium", "High"]), control=dict(type="string", enum=["proceed", "step_up", "hold"]),
    signals=dict(type="array", items=dict(type="string"), description="the signals that drove the decision, each one short"),
    explanation=dict(type="string"), employee_message=dict(type="string")))

async def log(contact_id: str, kind: str, conversation_id: str | None = None, channel: str | None = None, detail: dict | None = None):
    await db.insert("identity_events", dict(contact_id=contact_id, conversation_id=conversation_id, kind=kind, channel=channel, detail=detail or {}))

async def assess(conv: dict, action: str, args: dict | None = None) -> dict:
    """Called by the assistant's tools before a sensitive write. Returns the assessment; the caller enforces the control."""
    contact = await db.one("select c.*, a.name as account_name from contacts c join accounts a on a.id = c.account_id where c.id = %s", conv["customer_id"])
    async with AgentRun(AGENT, "conversation", "conversation", conv["id"], dict(action=action, channel=conv["channel"])) as run:
        await run.step("signals", f"assessing {action} on {conv['channel']}")
        emp = await strada.employee(contact["employee_id"]); await run.tool("strada.employee", dict(employee_id=contact["employee_id"]), {k: emp.get(k) for k in ("address_updated", "move_date", "bank")})
        audit = await strada.audit(contact["employee_id"]); await run.tool("strada.audit", dict(employee_id=contact["employee_id"]), audit[-10:])
        since = db.now() - timedelta(days=30)
        events = await db.fetch("select kind, channel, at, detail from identity_events where contact_id = %s and at >= %s order by at desc limit 20", contact["id"], since)
        pay = await strada.payment_status(contact["employee_id"])
        fails = sum(1 for e in events if e["kind"] == "verify_fail")
        signals_in = dict(action=action, channel=conv["channel"], verified=conv.get("verified"), verify_method=conv.get("verify_method"), failed_verifications_30d=fails,
                          address_updated=emp.get("address_updated"), move_date=emp.get("move_date"), bank_on_file=emp.get("bank"), last_payment=dict(status=pay.get("status"), return_code=pay.get("return_code")),
                          recent_identity_events=[dict(kind=e["kind"], channel=e["channel"], at=str(e["at"])[:16]) for e in events[:8]], recent_audit=[dict(action=a.get("action"), at=a.get("at", "")[:16]) for a in audit[-8:]],
                          requested=dict(new_routing=(args or {}).get("routing"), new_account_last4=str((args or {}).get("account", ""))[-4:] if (args or {}).get("account") else None, same_bank=(args or {}).get("routing") == (emp.get("bank") or {}).get("routing")))
        today = (await db.demo_now()).date()
        addr_days = (today - __import__("datetime").date.fromisoformat(emp["address_updated"])).days if emp.get("address_updated") else None
        def fb():
            sig = []; score = 0
            if addr_days is not None and addr_days <= 30: sig.append(f"Address changed {addr_days} days ago"); score += 2
            if action == "update_bank_details" and not signals_in["requested"]["same_bank"]: sig.append("New bank (different routing number)"); score += 1
            if fails: sig.append(f"{fails} failed verification(s) in 30 days"); score += 2
            if conv.get("verify_method") in ("ssn4", None) and conv["channel"] in ("chat", "voice"): sig.append("Verified by SSN last four only"); score += 1
            if pay.get("status") == "returned": sig.append("Last payment returned — change may be legitimate correction"); score -= 1
            risk = "High" if score >= 3 else "Medium" if score >= 1 else "Low"; control = {"High": "hold", "Medium": "step_up", "Low": "proceed"}[risk]
            return dict(risk=risk, control=control, signals=sig or ["No risk signals on record"], explanation=f"{risk} risk for {action}: " + ("; ".join(sig) or "no signals"), employee_message={"proceed": "Thanks — I can make that change now.", "step_up": "For your security I've sent a one-time code to the phone number we have on file; please read it to me.", "hold": "For your security I can't change bank details on this call. A payroll specialist will call you back on the number we have on file to complete it."}[control])
        out, model = await llm.structured("identity_risk", SYSTEM, json.dumps(signals_in, default=str), SCHEMA, fallback=fb)
        await run.tool("claude.structured", dict(model=model, task="identity_risk"), out)
        assessment = dict(at=(await db.demo_now()).isoformat(), action=action, **out)
        row = await db.update("conversations", conv["id"], dict(risk=assessment))
        await hub.broadcast("conversation.updated", row)
        await log(contact["id"], f"{action}_{out['control']}", conv["id"], conv["channel"], dict(risk=out["risk"], signals=out["signals"]))
        if conv.get("case_id"):
            await db.update("cases", conv["case_id"], dict(risk=assessment))
            await post(conv["case_id"], AGENT, f"{out['risk']} risk — {out['control'].replace('_', ' ')} ({action.replace('_', ' ')})", out["explanation"] + "\nSignals: " + "; ".join(out["signals"]))
            await case_changed(conv["case_id"])
        await db.emit("risk.assessed", dict(conversation_id=conv["id"], contact_id=contact["id"], action=action, risk=out["risk"], control=out["control"]))
        run.output = dict(conversation_id=conv["id"], action=action, risk=out["risk"], control=out["control"])
        return assessment
