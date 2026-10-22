"""State & Tax Rules Agent — applies the right state rule to the case in front of the representative:
a mid-year move (which forms, when the old state stops, county tax), a final-pay deadline, an address change that touches withholding.
Reads the employee record and the rules reference, cites what applies, says what each party must do, drafts the reply, and schedules the follow-ups."""
from __future__ import annotations
import json
from datetime import timedelta
from .. import db, llm
from ..strada import strada
from .base import AgentRun, post, case_changed

AGENT = "State & Tax Rules Agent"
INTENTS = {"Tax withholding change", "Final pay timing", "Employee data change"}

SYSTEM = """You are the State & Tax Rules Agent for Strada Payroll Support (US payroll). You are given the employee's record (work/resident state, previous address, move date, withholding on file),
the state rule reference for the states involved, the pay calendar, and the case. Determine exactly which rules apply, what forms are required, when the old state's withholding ends,
whether county/municipal tax applies and from when, and — for a termination — the final-pay deadline as a date. Cite the rule you rely on (the reference text, not a statute you are not given).
List concrete actions with who does each (employee, payroll, client). Draft a short reply to the person who raised the case. If the rules reference does not cover something, say so rather than guessing.
The case contact is not always the affected employee: a manager or client contact may be asking about someone else (e.g. a terminated associate). Apply the rules to the person the case describes, and never state that the case contact was terminated or moved unless the case says so."""

SCHEMA = dict(type="object", required=["determination", "rules_applied", "actions", "employee_explanation", "status"], properties=dict(
    determination=dict(type="string", description="Two or three sentences: what applies and from when"),
    rules_applied=dict(type="array", items=dict(type="object", required=["state", "rule", "applies"], properties=dict(state=dict(type="string"), rule=dict(type="string"), applies=dict(type="string", description="how it applies to this employee")))),
    forms_required=dict(type="array", items=dict(type="string")),
    deadline=dict(type="string", description="ISO date if a deadline results (final pay, form due), else empty"),
    county_tax=dict(type="string", description="County/municipal tax position, if relevant"),
    actions=dict(type="array", items=dict(type="object", required=["action", "who"], properties=dict(action=dict(type="string"), who=dict(type="string", enum=["employee", "payroll", "client"]), due_days=dict(type="integer")))),
    employee_explanation=dict(type="string"),
    status=dict(type="string", enum=["Waiting for Details", "In Progress", "Researching"], description="Case status that fits: waiting on the employee's form, or payroll action")))

async def run(case_id: str, trigger: str = "event") -> dict | None:
    case = await db.one("select c.*, ct.employee_id, ct.name as customer_name, ct.pay_group, ct.state as contact_state from cases c join contacts ct on ct.id = c.customer_id where c.id = %s", case_id)
    if not case: return None
    async with AgentRun(AGENT, trigger, "case", case_id, dict(intent=case["intent"], employee_id=case["employee_id"])) as run:
        await run.step("read", "reading the employee record and the state rules")
        emp = await strada.employee(case["employee_id"]); await run.tool("strada.employee", dict(employee_id=case["employee_id"]), {k: emp.get(k) for k in ("state", "county", "address", "previous_address", "move_date", "withholding")})
        states = [emp.get("state")] + ([emp["withholding"]["state"]] if emp.get("withholding") and emp["withholding"].get("state") != emp.get("state") else [])
        rules = {}
        for st in [s for s in states if s]:
            try: rules[st] = await strada.state_rules(st); await run.tool("strada.state_rules", dict(state=st), rules[st])
            except Exception as e: rules[st] = dict(error=str(e))
        cal = await strada.pay_calendar(case["pay_group"]) if case["pay_group"] in ("BW-NUR", "BW-ADM", "BW-OPS", "SM-CORP", "BW-STORE", "SM-HQ", "WK-PLANT", "SM-OFFICE") else {}
        if cal: await run.tool("strada.pay_calendar", dict(pay_group=case["pay_group"]), cal)
        await run.step("determine", "applying the rules")
        def fb():
            st = emp.get("state"); r = rules.get(st, {})
            if case["intent"] == "Final pay timing":
                return dict(determination=f"Under {st} rules final pay is due: {r.get('final_pay', 'see state reference')}. Next regular pay date for {case['pay_group']} is {cal.get('next_pay_date', 'tbc')}.", rules_applied=[dict(state=st, rule=r.get("final_pay", ""), applies="terminated employee's final pay")], forms_required=[], deadline=cal.get("next_pay_date", ""), county_tax="", actions=[dict(action="Include final pay in the next regular run", who="payroll", due_days=1), dict(action="Confirm no off-cycle request", who="client", due_days=1)], employee_explanation=f"Final pay is due by the next regular payday, {cal.get('next_pay_date', '')}, under {st} rules.", status="In Progress")
            prev = (emp.get("withholding") or {}).get("state")
            return dict(determination=f"Resident state is now {st}; withholding on file is {prev or 'not set'}. {st} requires form {r.get('withholding_form')}; the previous state's withholding ends the day before the move ({emp.get('move_date')}).", rules_applied=[dict(state=st, rule=f"Withholding form {r.get('withholding_form')}", applies="new resident state")] + ([dict(state=st, rule=r.get("county_tax_rule", ""), applies="county tax")] if r.get("county_tax") else []), forms_required=[r.get("withholding_form") or ""], deadline="", county_tax=r.get("county_tax_rule", "No county tax") if r.get("county_tax") is not None else "", actions=[dict(action=f"Submit {r.get('withholding_form')} in Strada Pay", who="employee", due_days=5), dict(action=f"End-date {prev} withholding as of the move date", who="payroll", due_days=1)], employee_explanation=f"Because you now live in {st}, we need form {r.get('withholding_form')} from you; your {prev} withholding stops from your move date.", status="Waiting for Details")
        user = f"Case intent: {case['intent']}\nCase: {case['title']} — {case.get('description')}\nEmployee: {case['customer_name']} · pay group {case['pay_group']}\nEmployee record: {json.dumps({k: emp.get(k) for k in ('state', 'county', 'address', 'previous_address', 'move_date', 'withholding', 'hire_date', 'status')}, default=str)}\nState rules reference: {json.dumps(rules, default=str)}\nPay calendar: {json.dumps(cal, default=str)}\nToday: {(await db.demo_now()).date().isoformat()}"
        out, model = await llm.structured("tax_rules", SYSTEM, user, SCHEMA, fallback=fb)
        await run.tool("claude.structured", dict(model=model, task="tax_rules"), out)
        now = await db.demo_now()
        finding = dict(at=now.isoformat(), states=[s for s in states if s], **out)
        findings = dict(case.get("findings") or {}); findings["rules"] = finding
        patch = dict(findings=findings, ai_updated=True, ai_fields=sorted(set(case["ai_fields"] or []) | {"summary", "highlights", "status"}), status=out["status"],
                     summary=f"{case['customer_name']}: {out['determination']}", highlights=[r["rule"] + " — " + r["applies"] for r in out["rules_applied"][:3]] + [f"{a['who'].title()}: {a['action']}" for a in out["actions"][:3]])
        if out.get("deadline"): patch["resolve_by"] = min(case.get("resolve_by") or now + timedelta(days=30), __import__("datetime").datetime.fromisoformat(out["deadline"]).replace(hour=17, tzinfo=now.tzinfo)) if len(out["deadline"]) >= 10 else case.get("resolve_by")
        await db.update("cases", case_id, patch)
        await post(case_id, AGENT, "State & tax rules applied", out["determination"] + "\n\n" + "\n".join(f"• {r['state']}: {r['rule']} — {r['applies']}" for r in out["rules_applied"]) + (f"\n\nCounty/municipal tax: {out['county_tax']}" if out.get("county_tax") else "") + (f"\nForms: {', '.join(out['forms_required'])}" if out.get("forms_required") else "") + (f"\nDeadline: {out['deadline']}" if out.get("deadline") else ""), type_="note")
        # follow-ups as agent-owned tasks
        for a in out["actions"]:
            if a["who"] in ("employee", "client"):
                await db.insert("activities", dict(id=db.new_id("t"), case_id=case_id, type="task", from_name=AGENT, agent=AGENT, subject=f"{a['who'].title()}: {a['action']}", status="Open", due=(now + timedelta(days=a.get("due_days") or 3)).replace(hour=10, minute=0, second=0, microsecond=0), ai_generated=True, at=now, modified_at=now))
        await db.emit("rules.applied", dict(case_id=case_id, intent=case["intent"], status=out["status"]))
        run.output = dict(case_id=case_id, number=case["number"], status=out["status"], forms=out.get("forms_required"), deadline=out.get("deadline"))
        await case_changed(case_id)
        return finding
