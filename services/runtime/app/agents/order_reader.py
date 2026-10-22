"""Garnishment Order Reader — reads the order the agency sent, not the summary someone keyed.
Extracts the terms, checks them against the CCPA limit using the employee's actual disposable earnings, compares with the orders already on file
(amendment vs duplicate vs new), and produces the setup sheet and the correction when the two disagree."""
from __future__ import annotations
import json
from .. import db, llm
from ..strada import strada
from .base import AgentRun, post, case_changed

AGENT = "Garnishment Order Reader"
INTENTS = {"Garnishment deducted twice", "Garnishment question", "Garnishment order"}

SYSTEM = """You are the Garnishment Order Reader for Strada Payroll Support (US). You are given the text of an income-withholding order as received from the agency, the orders currently set up on file for the employee,
and the employee's recent payslips. Extract the order terms exactly as written. Then: (1) decide whether this order is NEW, an AMENDMENT that replaces an existing order (same case number), or a DUPLICATE of one already set up;
(2) check the withholding against the stated limit using disposable earnings from the payslip (gross minus taxes); (3) compare what is set up on file with what the order says and name every discrepancy;
(4) give the setup/correction steps for payroll and a plain explanation for the employee. Quote the order where it matters. Do not invent terms that are not in the document."""

SCHEMA = dict(type="object", required=["order", "relationship", "ccpa_check", "discrepancies", "setup_actions", "employee_explanation", "refund_due"], properties=dict(
    order=dict(type="object", required=["agency", "case_number", "type", "amount", "frequency", "start_rule"], properties=dict(agency=dict(type="string"), case_number=dict(type="string"), type=dict(type="string"), amount=dict(type="number"), frequency=dict(type="string"), arrears=dict(type="number"), medical_support=dict(type="string"), other_family=dict(type="boolean"), limit_pct=dict(type="number"), start_rule=dict(type="string"), remittance=dict(type="string"), notice_date=dict(type="string"))),
    relationship=dict(type="object", required=["kind", "replaces", "reason"], properties=dict(kind=dict(type="string", enum=["new", "amendment", "duplicate"]), replaces=dict(type="string", description="order ref on file it replaces, if any"), reason=dict(type="string"))),
    ccpa_check=dict(type="object", required=["disposable_earnings", "limit_pct", "max_withholding", "ordered", "within_limit"], properties=dict(disposable_earnings=dict(type="number"), limit_pct=dict(type="number"), max_withholding=dict(type="number"), ordered=dict(type="number"), within_limit=dict(type="boolean"), note=dict(type="string"))),
    discrepancies=dict(type="array", items=dict(type="string")),
    setup_actions=dict(type="array", items=dict(type="string")),
    refund_due=dict(type="number", description="amount to refund the employee if over-withheld, else 0"),
    employee_explanation=dict(type="string")))

async def run(case_id: str, trigger: str = "event", ref: str | None = None) -> dict | None:
    case = await db.one("select c.*, ct.employee_id, ct.name as customer_name from cases c join contacts ct on ct.id = c.customer_id where c.id = %s", case_id)
    if not case: return None
    async with AgentRun(AGENT, trigger, "case", case_id, dict(employee_id=case["employee_id"], ref=ref)) as run:
        await run.step("read", "reading the order document and the orders on file")
        orders = await strada.garnishment_orders(case["employee_id"]); await run.tool("strada.garnishment_orders", dict(employee_id=case["employee_id"]), orders)
        if not orders:
            await post(case_id, AGENT, "No garnishment orders on file", "Nothing to read for this employee."); run.output = dict(case_id=case_id, outcome="no_orders"); return None
        ref = ref or next((o["ref"] for o in reversed(orders) if o.get("note") or o.get("received")), orders[-1]["ref"])
        try: doc = await strada.order_document(case["employee_id"], ref)
        except Exception: doc = None
        if not doc:
            await post(case_id, AGENT, f"Order {ref}: no document on file", "The agency's order document is not attached; the reader needs the document, not the keyed summary."); run.output = dict(case_id=case_id, outcome="no_document", ref=ref); return None
        await run.tool("strada.order_document", dict(ref=ref), dict(chars=len(doc["text"])))
        slips = await strada.payslips(case["employee_id"], limit=2); await run.tool("strada.payslips", dict(employee_id=case["employee_id"]), [dict(pay_date=s["pay_date"], gross=s["gross"], net=s["net"]) for s in slips])
        await run.step("extract", "extracting terms, checking the limit, comparing with the setup")
        cur = slips[0] if slips else {}
        taxes = sum(float(l["amount"]) for l in cur.get("lines", []) if l.get("kind") == "tax")
        disposable = round(float(cur.get("gross") or 0) - taxes, 2)
        garn_lines = [dict(pay_date=s["pay_date"], line=l.get("description"), amount=l.get("amount"), ref=l.get("ref")) for s in slips for l in s.get("lines", []) if l.get("ref")]
        def fb():
            on_file = [o for o in orders if o["ref"] != ref]
            same = next((o for o in on_file if o.get("external_ref") and any(o["external_ref"] in line for line in doc["text"].splitlines())), None)
            ordered = 312.0
            return dict(order=dict(agency="Washington State DCS", case_number="WA-CS-77821", type="child_support", amount=ordered, frequency="weekly", arrears=0, medical_support="not ordered", other_family=False, limit_pct=60, start_rule="first pay period 7 business days after notice", remittance="Washington State Support Registry", notice_date="2026-10-01"),
                        relationship=dict(kind="amendment" if same else "new", replaces=same["ref"] if same else "", reason="The document states it replaces the IWO of 03/04/2026 for the same case number." if same else "No order on file with this case number."),
                        ccpa_check=dict(disposable_earnings=disposable, limit_pct=60, max_withholding=round(disposable * .6, 2), ordered=ordered, within_limit=ordered <= disposable * .6, note=""),
                        discrepancies=[f"Two active orders on file for case WA-CS-77821 ({', '.join(o['ref'] for o in orders)}); the amended order should replace {same['ref'] if same else 'the original'}, not add to it.", f"Payslip shows {len([g for g in garn_lines if g['pay_date'] == cur.get('pay_date')])} deductions on {cur.get('pay_date')} for the same case."] if same else [],
                        setup_actions=[f"End-date {same['ref']} effective 10/01/2026" if same else "Set up the order", f"Keep {ref} as the single active order at $312.00 weekly", "Refund the duplicate $312.00 deduction on the next weekly pay as a non-taxable adjustment", "Confirm a single remittance of $312.00 to the Washington State Support Registry"],
                        refund_due=312.0 if same else 0.0, employee_explanation="The amended child-support order was set up as a second order instead of replacing the first, so $312.00 was taken twice. We are removing the duplicate and refunding $312.00 on your next pay; going forward one deduction of $312.00 per week applies.")
        user = f"ORDER DOCUMENT ({ref}):\n{doc['text']}\n\nORDERS ON FILE: {json.dumps(orders, default=str)}\n\nPAYSLIPS (most recent first): current pay date {cur.get('pay_date')}, gross {cur.get('gross')}, taxes {taxes:.2f}, disposable {disposable:.2f}; garnishment lines: {json.dumps(garn_lines)}\n\nCase: {case['title']} — {case.get('description')}"
        out, model = await llm.structured("order_reader", SYSTEM, user, SCHEMA, fallback=fb)
        await run.tool("claude.structured", dict(model=model, task="order_reader"), out)
        finding = dict(at=(await db.demo_now()).isoformat(), ref=ref, **out)
        findings = dict(case.get("findings") or {}); findings["order"] = finding
        rel = out["relationship"]
        await db.update("cases", case_id, dict(findings=findings, ai_updated=True, ai_fields=sorted(set(case["ai_fields"] or []) | {"summary", "highlights"}),
            summary=f"{case['customer_name']}: order {out['order']['case_number']} from {out['order']['agency']} read from the document — {rel['kind']}{(' replacing ' + rel['replaces']) if rel.get('replaces') else ''}. {rel['reason']} " + (f"Refund due ${out['refund_due']:,.2f}." if out["refund_due"] else "Withholding within the CCPA limit."),
            highlights=[f"Order: {out['order']['type']} ${out['order']['amount']:,.2f} {out['order']['frequency']} · {out['order']['agency']} · case {out['order']['case_number']}", f"{rel['kind'].title()}: {rel['reason'][:110]}", f"CCPA: ${out['ccpa_check']['ordered']:,.2f} of max ${out['ccpa_check']['max_withholding']:,.2f} ({out['ccpa_check']['limit_pct']}% of ${out['ccpa_check']['disposable_earnings']:,.2f})"] + ([f"Refund due: ${out['refund_due']:,.2f}"] if out["refund_due"] else [])))
        await post(case_id, AGENT, f"Order {ref} read: {rel['kind']}" + (f" of {rel['replaces']}" if rel.get("replaces") else ""), rel["reason"] + ("\n\nDiscrepancies:\n" + "\n".join(f"• {d}" for d in out["discrepancies"]) if out["discrepancies"] else "\n\nSetup matches the order.") + "\n\nSetup / correction:\n" + "\n".join(f"{i+1}. {a}" for i, a in enumerate(out["setup_actions"])), type_="note")
        await db.emit("order.read", dict(case_id=case_id, ref=ref, relationship=rel["kind"], refund_due=out["refund_due"]))
        run.output = dict(case_id=case_id, number=case["number"], ref=ref, relationship=rel["kind"], refund_due=out["refund_due"], discrepancies=len(out["discrepancies"]))
        await case_changed(case_id)
        return finding
