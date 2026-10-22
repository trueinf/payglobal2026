"""Payslip Variance Explainer — "why is my pay different?" answered from the payslips themselves.
Compares the two most recent payslips line by line, explains each change in plain language with its cause, flags anything that
looks like an error (not just a change), drafts the employee reply, and records it all on the case."""
from __future__ import annotations
import json
from .. import db, llm
from ..strada import strada
from ..tools import payslip_diff
from .base import AgentRun, post, case_changed

AGENT = "Payslip Variance Explainer"
INTENTS = {"Payslip variance"}

SYSTEM = """You are the Payslip Variance Explainer for Strada Payroll Support. You are given an employee's two most recent payslips and the exact line differences.
Explain each difference the way a good payroll specialist would to the employee: what changed, by how much, and the most likely cause from the data (hours, rate, a new or changed deduction, tax tables, a one-off item). Say clearly which changes are expected and which look like errors needing correction.
Amounts in dollars and cents. Do not invent causes the data cannot support; say "likely" when inferring."""

SCHEMA = dict(type="object", required=["headline", "differences", "employee_explanation", "representative_note", "needs_correction"], properties=dict(
    headline=dict(type="string", description="One sentence: net pay changed by $X because …"),
    differences=dict(type="array", items=dict(type="object", required=["line", "change", "cause", "expected"], properties=dict(
        line=dict(type="string"), change=dict(type="string", description="e.g. +$62.50 (401(k) 6% → 8%)"), cause=dict(type="string"), expected=dict(type="boolean", description="true if a normal/expected change; false if it looks like an error")))),
    employee_explanation=dict(type="string", description="The reply to the employee, 3-6 sentences, friendly and specific"),
    representative_note=dict(type="string", description="Internal note: what to check or correct, if anything"),
    needs_correction=dict(type="boolean"), correction_summary=dict(type="string")))

async def run(case_id: str, trigger: str = "event") -> dict | None:
    case = await db.one("select c.*, ct.employee_id, ct.name as customer_name, ct.pay_group from cases c join contacts ct on ct.id = c.customer_id where c.id = %s", case_id)
    if not case: return None
    async with AgentRun(AGENT, trigger, "case", case_id, dict(employee_id=case["employee_id"])) as run:
        await run.step("read", "reading the last two payslips")
        slips = await strada.payslips(case["employee_id"], limit=2)
        d = payslip_diff(slips)
        await run.tool("strada.payslips", dict(employee_id=case["employee_id"], limit=2), dict(pay_dates=[s.get("pay_date") for s in slips], net_change=d.get("net_change"), differences=len(d.get("differences", []))))
        if d.get("error") or not d.get("previous"):
            await post(case_id, AGENT, "Payslip comparison not possible", "Only one payslip is available for this employee; nothing to compare yet.")
            run.output = dict(case_id=case_id, outcome="no_previous"); return None
        await run.step("explain", "explaining each difference")
        def fb():
            diffs = [dict(line=x["line"], change=f"{'+' if x['delta'] >= 0 else '-'}${abs(x['delta']):,.2f}", cause="Changed versus the previous payslip", expected=True) for x in d["differences"]]
            return dict(headline=f"Net pay changed by ${d['net_change']:,.2f} versus the previous payslip across {len(diffs)} lines.", differences=diffs, employee_explanation=f"Your net pay of ${d['net']:,.2f} differs from last period's ${d['previous']['net']:,.2f} because of {len(diffs)} line changes; details are on your payslip.", representative_note="Review the changed lines.", needs_correction=False, correction_summary="")
        user = f"Employee: {case['customer_name']} · pay group {case['pay_group']}\nCase description: {case.get('description')}\n\nCurrent payslip ({d['pay_date']}): gross {d['gross']:.2f}, net {d['net']:.2f}, hours {d['hours']}\nPrevious payslip ({d['previous']['pay_date']}): gross {d['previous']['gross']:.2f}, net {d['previous']['net']:.2f}, hours {d['previous']['hours']}\nNet change: {d['net_change']:.2f}\n\nLine differences: {json.dumps(d['differences'])}\nAll current lines: {json.dumps(d['lines'])}"
        out, model = await llm.structured("variance", SYSTEM, user, SCHEMA, fallback=fb)
        await run.tool("claude.structured", dict(model=model, task="variance"), out)
        finding = dict(at=(await db.demo_now()).isoformat(), pay_date=d["pay_date"], previous_pay_date=d["previous"]["pay_date"], net=d["net"], previous_net=d["previous"]["net"], net_change=d["net_change"], **out)
        findings = dict(case.get("findings") or {}); findings["variance"] = finding
        patch = dict(findings=findings, ai_updated=True, ai_fields=sorted(set(case["ai_fields"] or []) | {"summary", "highlights"}),
                     summary=f"{case['customer_name']} asked why their pay changed. {out['headline']} " + ("One or more lines look like errors and need correction." if out["needs_correction"] else "All changes are expected; the explanation is ready to send."),
                     highlights=[out["headline"]] + [f"{x['line']}: {x['change']} — {x['cause']}" for x in out["differences"][:3]] + (["Correction needed: " + (out.get("correction_summary") or out["representative_note"])] if out["needs_correction"] else []))
        if out["needs_correction"] and case["type"] != "Problem": patch["type"] = "Problem"; patch["ai_fields"] = sorted(set(patch["ai_fields"]) | {"type"})
        await db.update("cases", case_id, patch)
        await post(case_id, AGENT, "Payslip variance explained", out["headline"] + "\n\n" + "\n".join(f"• {x['line']}: {x['change']} — {x['cause']}{'' if x['expected'] else ' (looks like an error)'}" for x in out["differences"]) + f"\n\nFor the representative: {out['representative_note']}", type_="note")
        await db.emit("variance.explained", dict(case_id=case_id, needs_correction=out["needs_correction"]))
        run.output = dict(case_id=case_id, number=case["number"], needs_correction=out["needs_correction"], differences=len(out["differences"]))
        await case_changed(case_id)
        return finding
