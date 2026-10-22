"""Complete-Case Referral Agent — a referral to Strada Assist (Tier 2/3) never goes out incomplete.
It asks Strada Assist what evidence the request type needs, collects each item from the systems and the case, shows the representative
exactly what is still missing and who must supply it, and submits the package the moment it is complete."""
from __future__ import annotations
import json
from .. import db, llm
from ..bus import hub
from ..config import settings
from ..strada import strada
from .base import AgentRun, post, case_changed

AGENT = "Complete-Case Referral Agent"
TYPES = ["reissue", "live_check", "correction", "off_cycle", "w2c", "garnishment_dispute"]
LABELS = dict(reissue="Re-issue payment", live_check="Live check", correction="Pay correction", off_cycle="Off-cycle payment", w2c="W-2c (corrected W-2)", garnishment_dispute="Garnishment dispute")
WHO = dict(bank_corrected="employee", client_approval="client", box="representative", delivery_site="representative", reason="representative", employee_statement="representative", year="representative")

SYSTEM = "You prepare referral packages for Strada Assist from a support case. Extract only what the case and transcript state; leave a field empty if it is not stated. Be concise and factual."
SCHEMA = dict(type="object", required=["summary", "reason"], properties=dict(
    summary=dict(type="string", description="Two-sentence case summary for Tier 2"), reason=dict(type="string", description="The reason for the correction/off-cycle/dispute, one sentence; empty if not stated"),
    employee_statement=dict(type="string", description="What the employee says happened, in their words if available"), year=dict(type="string", description="Tax year if the case mentions one"), box=dict(type="string", description="W-2 box if mentioned")))

def infer_type(case: dict, emp: dict) -> str:
    i = (case.get("intent") or "").lower(); t = (case.get("title") or "").lower()
    if "garnish" in i or "garnish" in t: return "garnishment_dispute"
    if "w-2" in t or "w2" in t or "document" in i: return "w2c"
    if "final pay" in i: return "off_cycle"
    if "bank return" in i or "not received" in t: return "reissue" if (emp.get("bank") or {}).get("status") == "ok" else "live_check"
    return "correction"

async def prepare(case_id: str, request_type: str | None = None, extra: dict | None = None, submit: bool = False, trigger: str = "manual") -> dict:
    extra = extra or {}
    case = await db.one("select c.*, ct.employee_id, ct.name as customer_name, a.name as account_name from cases c join contacts ct on ct.id = c.customer_id join accounts a on a.id = c.account_id where c.id = %s", case_id)
    if not case: raise ValueError("unknown case")
    emp = await strada.employee(case["employee_id"])
    request_type = request_type or infer_type(case, emp)
    if request_type not in TYPES: raise ValueError(f"unknown request type {request_type}")
    async with AgentRun(AGENT, trigger, "case", case_id, dict(request_type=request_type, submit=submit, extra=list(extra))) as run:
        await run.step("requirements", f"asking Strada Assist what a {LABELS[request_type]} referral needs")
        probe = await strada.create_assist_case(request_type=request_type, employee_id=case["employee_id"], source_case=case["number"], summary="(probe)", evidence={})
        required = (probe.get("error") or {}).get("missing", []) if isinstance(probe.get("error"), dict) else []
        await run.tool("strada.assist.requirements", dict(request_type=request_type), dict(required=required))
        await run.step("gather", "collecting the evidence from the systems and the case")
        pay = await strada.payment_status(case["employee_id"]); await run.tool("strada.payment_status", dict(employee_id=case["employee_id"]), pay)
        lines = await db.fetch("select who, text from transcript_lines tl join conversations cv on cv.id = tl.conversation_id where cv.case_id = %s order by tl.id", case_id)
        transcript = "\n".join(f"{l['who']}: {l['text']}" for l in lines)
        def fb(): return dict(summary=(case.get("summary") or case["title"])[:300], reason=(case.get("description") or "")[:200], employee_statement=next((l["text"] for l in lines if l["who"] == "Customer"), ""), year="", box="")
        ext, model = await llm.structured("referral_extract", SYSTEM, f"Case {case['number']}: {case['title']}\nDescription: {case.get('description')}\nSummary: {case.get('summary')}\nTranscript:\n{transcript[:3000]}", SCHEMA, fallback=fb)
        await run.tool("claude.structured", dict(model=model, task="referral_extract"), ext)
        ev: dict = {}; checklist = []
        def add(item, value, source):
            ok = value not in (None, "", [], {})
            if ok: ev[item] = value
            checklist.append(dict(item=item, satisfied=ok, source=source if ok else None, value=value if ok else None, who=None if ok else WHO.get(item, "representative")))
        for item in required:
            if item in extra and extra[item] not in (None, ""): add(item, extra[item], "representative"); continue
            if item == "pay_date": add(item, pay.get("pay_date"), "Strada payments")
            elif item == "amount": add(item, pay.get("amount"), "Strada payments")
            elif item == "return_code": add(item, pay.get("return_code"), "Strada payments")
            elif item == "bank_corrected": b = emp.get("bank") or {}; add(item, f"account ending {b.get('account_last4')} updated {str(b.get('updated', ''))[:10]}" if b.get("status") == "ok" and b.get("updated") else None, "Strada People")
            elif item == "delivery_site": add(item, emp.get("address"), "Strada People (address on file)")
            elif item == "reason": add(item, ext.get("reason"), "case")
            elif item == "employee_statement": add(item, ext.get("employee_statement"), "conversation")
            elif item == "year": add(item, ext.get("year"), "case")
            elif item == "box": add(item, ext.get("box"), "case")
            elif item == "client_approval": add(item, None, None)
            elif item == "order_ref":
                orders = await strada.garnishment_orders(case["employee_id"]); await run.tool("strada.garnishment_orders", dict(employee_id=case["employee_id"]), orders)
                add(item, ", ".join(o.get("ref", "") for o in orders) if orders else None, "Strada garnishments")
            elif item == "deduction_history":
                slips = await strada.payslips(case["employee_id"], limit=2)
                hist = [dict(pay_date=s.get("pay_date"), line=l.get("description") or l.get("label"), amount=l.get("amount"), ref=l.get("ref")) for s in slips for l in s.get("lines", []) if l.get("kind") in ("garnishment", "deduction") and ("support" in (l.get("description") or l.get("label") or "").lower() or l.get("ref"))]
                add(item, hist or None, "payslips")
            else: add(item, None, None)
        missing = [c["item"] for c in checklist if not c["satisfied"]]
        complete = not missing
        row = await db.one("select * from referrals where case_id = %s and request_type = %s", case_id, request_type)
        package = dict(request_type=request_type, employee_id=case["employee_id"], source_case=case["number"], summary=ext.get("summary") or case.get("summary"), evidence=ev, requested_by="Wipro Tier-1")
        data = dict(case_id=case_id, request_type=request_type, checklist=checklist, complete=complete, missing=missing, package=package, status="incomplete" if missing else "preparing", updated_at=db.now())
        row = await db.update("referrals", row["id"], data) if row else await db.insert("referrals", data)
        if complete and submit:
            await run.step("submit", "submitting the complete package to Strada Assist")
            res = await strada.create_assist_case(**package)
            await run.tool("strada.assist.create", dict(request_type=request_type, evidence=list(ev)), res)
            if res.get("error"): raise ValueError(f"Strada Assist rejected the referral: {res['error']}")
            row = await db.update("referrals", row["id"], dict(status="submitted", strada_reference=res["reference"], expected_by=res.get("expected_by"), updated_at=db.now()))
            await post(case_id, AGENT, f"Referred to Strada Assist – {res['reference']}", f"{LABELS[request_type]} referral submitted with all {len(required)} required items: {', '.join(required)}." + (f" Expected by {res['expected_by']}." if res.get("expected_by") else ""))
            await db.update("cases", case_id, dict(status="In Progress", highlights=(case["highlights"] or []) + [f"Strada Assist {res['reference']} ({LABELS[request_type]}) – complete package, no bounce-back"], ai_updated=True, ai_fields=sorted(set(case["ai_fields"] or []) | {"highlights"})))
            await db.emit("referral.submitted", dict(case_id=case_id, reference=res["reference"], request_type=request_type))
            run.output = dict(case_id=case_id, number=case["number"], reference=res["reference"], request_type=request_type)
        elif complete:
            await post(case_id, AGENT, f"{LABELS[request_type]} referral ready", f"All {len(required)} items Strada Assist requires are in the package ({', '.join(required)}). Submit from the Referral card.")
            run.output = dict(case_id=case_id, number=case["number"], request_type=request_type, ready=True)
        else:
            who = {c["item"]: c["who"] for c in checklist if not c["satisfied"]}
            await post(case_id, AGENT, f"{LABELS[request_type]} referral – {len(missing)} item{'s' if len(missing) > 1 else ''} missing", "Collected: " + ", ".join(ev) + "\nStill needed: " + ", ".join(f"{m} ({who[m]})" for m in missing) + "\nThe referral will not be sent until these are in; that is what keeps it from bouncing back.")
            await run.wait("missing: " + ", ".join(missing))
            run.output = dict(case_id=case_id, number=case["number"], request_type=request_type, missing=missing)
        await hub.broadcast("referral.updated", row)
        await case_changed(case_id)
        return row
