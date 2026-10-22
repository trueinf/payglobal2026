"""Strada systems mock — Strada People, payslips, payment status, ACH returns, time, garnishment orders, tax documents, Strada Assist.
Reads are open; writes go only through the endpoints the HRO operating model allows (self-service updates and case requests) and are audited.
"""
from __future__ import annotations
import os, uuid
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
from . import data as db

app = FastAPI(title="Strada systems (mock)", version="0.1")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
RUNTIME_URL = os.getenv("RUNTIME_URL", "http://localhost:8080")

def now(): return datetime.now(timezone.utc).isoformat()
def audit(action: str, who: str, detail: dict):
    db.AUDIT.append(dict(at=now(), action=action, actor=who, **detail))

async def emit(type_: str, payload: dict):
    """post an event to the runtime's event stream; best effort"""
    try:
        async with httpx.AsyncClient(timeout=3) as c:
            await c.post(f"{RUNTIME_URL}/events", json=dict(type=type_, payload=payload, source="strada-sys"))
    except Exception:
        pass

def emp(employee_id: str) -> dict:
    e = db.EMPLOYEES.get(employee_id)
    if not e: raise HTTPException(404, "employee not found")
    return e

# ---------- Strada People ----------
@app.get("/people/employees/{employee_id}")
def get_employee(employee_id: str):
    e = emp(employee_id); return dict(employee_id=employee_id, **{k: v for k, v in e.items() if k != "ssn_last4"})

@app.get("/people/employees")
def find_employee(phone: str | None = None, email: str | None = None, contact_id: str | None = None):
    for eid, e in db.EMPLOYEES.items():
        if (phone and e["phone"] == phone) or (email and e["email"].lower() == email.lower()) or (contact_id and e["contact_id"] == contact_id):
            return dict(employee_id=eid, **{k: v for k, v in e.items() if k != "ssn_last4"})
    raise HTTPException(404, "no match")

class Verify(BaseModel):
    ssn_last4: str | None = None
    otp: str | None = None
    phone: str | None = None

@app.post("/people/employees/{employee_id}/verify")
def verify(employee_id: str, v: Verify):
    e = emp(employee_id)
    ok = (v.ssn_last4 and v.ssn_last4 == e["ssn_last4"]) or (v.otp and len(v.otp) == 6) or (v.phone and v.phone == e["phone"])
    audit("identity.verify", "runtime", dict(employee_id=employee_id, method="ssn4" if v.ssn_last4 else "otp" if v.otp else "ani", ok=bool(ok)))
    return dict(verified=bool(ok), method="ssn4" if v.ssn_last4 else "otp" if v.otp else "ani")

class BankUpdate(BaseModel):
    routing: str
    account: str
    confirmed_by: str = "employee"   # employee self-service only

@app.put("/people/employees/{employee_id}/bank")
async def update_bank(employee_id: str, b: BankUpdate):
    e = emp(employee_id)
    if b.confirmed_by != "employee": raise HTTPException(403, "bank details may only be changed by the employee through self-service")
    if not (b.routing.isdigit() and len(b.routing) == 9 and b.account.isdigit() and 4 <= len(b.account) <= 17): raise HTTPException(422, "invalid routing or account number")
    e["bank"] = dict(routing=b.routing, account_masked="••••" + b.account[-4:], account_last4=b.account[-4:], status="ok", updated=now())
    audit("bank.update", "employee", dict(employee_id=employee_id, last4=b.account[-4:]))
    await emit("bank.updated", dict(employee_id=employee_id, contact_id=e["contact_id"]))
    return dict(ok=True, bank=e["bank"])

class AddressUpdate(BaseModel):
    address: str

@app.put("/people/employees/{employee_id}/address")
async def update_address(employee_id: str, a: AddressUpdate):
    e = emp(employee_id); e["previous_address"] = e["address"]; e["address"] = a.address; e["address_updated"] = now()
    audit("address.update", "employee", dict(employee_id=employee_id))
    await emit("address.updated", dict(employee_id=employee_id, contact_id=e["contact_id"]))
    return dict(ok=True, address=a.address)

class WithholdingUpdate(BaseModel):
    state: str
    form: str
    county: str | None = None
    effective: str

@app.put("/people/employees/{employee_id}/withholding")
async def update_withholding(employee_id: str, w: WithholdingUpdate):
    e = emp(employee_id); e["withholding"] = dict(state=w.state, form=w.form, county=w.county, effective=w.effective, submitted=now())
    audit("withholding.update", "employee", dict(employee_id=employee_id, state=w.state, form=w.form))
    await emit("withholding.updated", dict(employee_id=employee_id, contact_id=e["contact_id"], state=w.state, form=w.form))
    return dict(ok=True, withholding=e["withholding"])

# ---------- Pay ----------
@app.get("/pay/calendar")
def pay_calendar(pay_group: str | None = None):
    if pay_group:
        if pay_group not in db.PAY_GROUPS: raise HTTPException(404)
        return dict(pay_group=pay_group, **db.PAY_GROUPS[pay_group])
    return [dict(pay_group=k, **v) for k, v in db.PAY_GROUPS.items()]

@app.get("/pay/payslips/{employee_id}")
def payslips(employee_id: str, limit: int = 2):
    emp(employee_id); return db.PAYSLIPS.get(employee_id, [])[:limit]

@app.get("/pay/payments/{employee_id}")
def payment_status(employee_id: str, as_of: str | None = None):
    emp(employee_id); return dict(employee_id=employee_id, **db.payment_as_of(employee_id, as_of))

class Remedy(BaseModel):
    type: str            # live_check | redeposit
    reference: str = ""
    as_of: str           # ISO date/time the remedy was arranged (demo clock)
    requested_by: str = "runtime"

@app.post("/pay/payments/{employee_id}/remedy")
async def payment_remedy(employee_id: str, r: Remedy):
    emp(employee_id)
    if r.type not in ("live_check", "redeposit"): raise HTTPException(422, "type must be live_check or redeposit")
    rem = db.set_remedy(employee_id, r.type, r.reference or f"{r.type.upper()}-{uuid.uuid4().hex[:6].upper()}", r.as_of)
    audit("payment.remedy", r.requested_by, dict(employee_id=employee_id, **rem))
    await emit("payment.remedy_arranged", dict(employee_id=employee_id, contact_id=db.EMPLOYEES[employee_id]["contact_id"], **rem))
    return rem

@app.post("/demo/reset")
def demo_reset():
    """Back to the seeded day: reload the data module."""
    import importlib; importlib.reload(db); return dict(ok=True, employees=len(db.EMPLOYEES))

# ---- scenario triggers: the feeds that, in production, arrive from the bank and the time system ----
class AchFile(BaseModel):
    pay_group: str = "BW-OPS"; code: str = "R04"; reason: str = "Invalid account number"; employee_ids: list[str] | None = None

@app.post("/demo/scenario/ach-return-file")
async def scenario_ach(f: AchFile):
    if f.pay_group not in db.PAY_GROUPS: raise HTTPException(404, "unknown pay group")
    rows = db.post_ach_return_file(f.pay_group, f.code, f.reason, f.employee_ids)
    audit("ach.return_file", "bank", dict(pay_group=f.pay_group, returns=len(rows)))
    for r in rows:
        await emit("ach.return_posted", dict(contact_id=db.EMPLOYEES[r["employee_id"]]["contact_id"], **r))
    return dict(posted=len(rows), returns=rows)

class Cutoff(BaseModel):
    pay_group: str = "WK-PLANT"

@app.post("/demo/scenario/timesheet-cutoff")
async def scenario_cutoff(c: Cutoff):
    pg = db.PAY_GROUPS.get(c.pay_group)
    if not pg: raise HTTPException(404, "unknown pay group")
    rows = [t for t in db.TIMESHEETS if t["pay_group"] == c.pay_group and t["status"] == "unapproved"]
    managers = sorted({t["manager"] for t in rows})
    lead = next((v for v in db.EMPLOYEES.values() if v["account"] == pg["account"] and "client payroll" in (v.get("role") or "")), None)   # the runtime falls back to the account's payroll lead
    audit("timesheet.cutoff", "time-system", dict(pay_group=c.pay_group, unapproved=len(rows)))
    await emit("timesheet.unapproved_at_cutoff", dict(pay_group=c.pay_group, client=pg["client"], account_id=pg["account"], cutoff=db.d(0), next_pay_date=pg["next_pay_date"], unapproved=len(rows), hours=sum(t["hours"] for t in rows), managers=managers, employees=[dict(employee_id=t["employee_id"], name=t["name"], hours=t["hours"]) for t in rows], client_contact_id=(lead or {}).get("contact_id")))
    return dict(pay_group=c.pay_group, unapproved=len(rows), managers=managers)

@app.get("/pay/ach/returns")
def ach_returns(pay_group: str | None = None, pay_date: str | None = None):
    rows = db.ACH_RETURNS
    if pay_group: rows = [r for r in rows if r["pay_group"] == pay_group]
    if pay_date: rows = [r for r in rows if r["pay_date"] == pay_date]
    return rows

@app.get("/time/timesheets")
def timesheets(pay_group: str | None = None, status: str | None = None):
    rows = db.TIMESHEETS
    if pay_group: rows = [r for r in rows if r["pay_group"] == pay_group]
    if status: rows = [r for r in rows if r["status"] == status]
    return rows

@app.get("/garnishments/orders/{employee_id}")
def orders(employee_id: str):
    emp(employee_id); return db.GARNISHMENT_ORDERS.get(employee_id, [])

@app.get("/garnishments/orders/{employee_id}/documents/{ref}")
def order_document(employee_id: str, ref: str):
    emp(employee_id)
    doc = db.ORDER_DOCUMENTS.get(ref)
    if not doc: raise HTTPException(404, "no document on file for this order")
    return dict(ref=ref, employee_id=employee_id, text=doc)

@app.get("/tax/documents/{employee_id}")
def tax_docs(employee_id: str):
    emp(employee_id); return db.TAX_DOCUMENTS.get(employee_id, [])

class Reissue(BaseModel):
    year: int
    type: str = "W-2"
    delivery: str = "document_centre"

@app.post("/tax/documents/{employee_id}/reissue")
async def reissue_doc(employee_id: str, r: Reissue):
    e = emp(employee_id)
    for doc in db.TAX_DOCUMENTS.get(employee_id, []):
        if doc["year"] == r.year and doc["type"] == r.type:
            doc["reissued"] = now(); doc["status"] = "reissued"
            audit("document.reissue", "runtime", dict(employee_id=employee_id, year=r.year, type=r.type))
            await emit("document.reissued", dict(employee_id=employee_id, contact_id=e["contact_id"], year=r.year, type=r.type))
            return dict(ok=True, available_in_minutes=15, document=doc)
    raise HTTPException(404, "document not found")

@app.get("/tax/rules/{state}")
def state_rules(state: str):
    s = db.STATE_RULES.get(state.upper())
    if not s: raise HTTPException(404, "no rules on file for that state")
    return dict(state=state.upper(), **s)

# ---------- Strada Assist (requests to Strada payroll) ----------
class AssistCase(BaseModel):
    request_type: str                 # reissue | correction | off_cycle | w2c | garnishment_dispute | live_check
    employee_id: str
    source_case: str
    summary: str
    evidence: dict = {}
    client_policy_check: str | None = None
    requested_by: str = "Wipro Tier-1"

@app.post("/assist/cases")
async def create_assist_case(c: AssistCase):
    e = emp(c.employee_id)
    required = {"reissue": ["pay_date","amount","return_code","bank_corrected"], "live_check": ["pay_date","amount","return_code","delivery_site"], "correction": ["pay_date","amount","reason"], "off_cycle": ["pay_date","amount","reason","client_approval"], "w2c": ["year","box","reason"], "garnishment_dispute": ["order_ref","deduction_history","employee_statement"]}
    missing = [k for k in required.get(c.request_type, []) if k not in c.evidence]
    if missing: raise HTTPException(422, dict(message="incomplete request", missing=missing))
    ref = f"SA-{datetime.now().strftime('%y%m%d')}-{len(db.ASSIST_CASES)+101}"
    rec = dict(reference=ref, status="received", created=now(), expected_by=None, **c.model_dump())
    rec["expected_by"] = db.PAY_GROUPS[e["pay_group"]]["next_pay_date"] if c.request_type in ("reissue","correction") else None
    db.ASSIST_CASES.append(rec)
    audit("assist.create", c.requested_by, dict(reference=ref, request_type=c.request_type, employee_id=c.employee_id))
    await emit("assist.created", dict(reference=ref, request_type=c.request_type, employee_id=c.employee_id, contact_id=e["contact_id"], source_case=c.source_case))
    return rec

@app.get("/assist/cases")
def list_assist(): return db.ASSIST_CASES

@app.get("/assist/cases/{reference}")
def get_assist(reference: str):
    for r in db.ASSIST_CASES:
        if r["reference"] == reference: return r
    raise HTTPException(404)

@app.post("/assist/cases/{reference}/status")
async def set_assist_status(reference: str, status: str):
    for r in db.ASSIST_CASES:
        if r["reference"] == reference:
            r["status"] = status; r["updated"] = now()
            await emit("assist.status", dict(reference=reference, status=status, source_case=r["source_case"], contact_id=db.EMPLOYEES[r["employee_id"]]["contact_id"]))
            return r
    raise HTTPException(404)

@app.get("/audit")
def get_audit(employee_id: str | None = None):
    rows = db.AUDIT[-500:]
    return [r for r in rows if r.get("employee_id") == employee_id] if employee_id else rows[-200:]

@app.get("/health")
def health(): return dict(ok=True, employees=len(db.EMPLOYEES), today=db.today.isoformat())
