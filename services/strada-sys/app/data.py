"""Mock Strada systems of record. Deterministic, seeded, dates relative to today.
Employees mirror strada.contacts; payslips/payments/ACH/time/orders are only here, as they would be in Strada's engines.
"""
from __future__ import annotations
from datetime import date, datetime, timedelta, timezone
from typing import Any

today = date.today()
def d(days: int) -> str: return (today + timedelta(days=days)).isoformat()

# pay calendars per pay group: frequency, last pay date, cut-off rule
PAY_GROUPS: dict[str, dict[str, Any]] = {
    "BW-NUR":   dict(account="a2", client="Meridian Health Partners", frequency="bi-weekly", pay_day="Friday", last_pay_date=d(0), next_pay_date=d(14), cutoff=d(12), ach_release=d(-2)),
    "BW-ADM":   dict(account="a2", client="Meridian Health Partners", frequency="bi-weekly", pay_day="Friday", last_pay_date=d(0), next_pay_date=d(14), cutoff=d(12), ach_release=d(-2)),
    "BW-OPS":   dict(account="a1", client="Harbor Point Logistics", frequency="bi-weekly", pay_day="Friday", last_pay_date=d(-7), next_pay_date=d(7), cutoff=d(5), ach_release=d(5)),
    "SM-CORP":  dict(account="a1", client="Harbor Point Logistics", frequency="semi-monthly", pay_day="15th/last", last_pay_date=d(-6), next_pay_date=d(10), cutoff=d(8), ach_release=d(8)),
    "BW-STORE": dict(account="a3", client="Northbridge Retail Group", frequency="bi-weekly", pay_day="Friday", last_pay_date=d(-7), next_pay_date=d(7), cutoff=d(5), ach_release=d(5)),
    "SM-HQ":    dict(account="a3", client="Northbridge Retail Group", frequency="semi-monthly", pay_day="15th/last", last_pay_date=d(-6), next_pay_date=d(10), cutoff=d(8), ach_release=d(8)),
    "WK-PLANT": dict(account="a4", client="Cascade Foods", frequency="weekly", pay_day="Thursday", last_pay_date=d(-1), next_pay_date=d(6), cutoff=d(4), ach_release=d(4)),
    "SM-OFFICE":dict(account="a4", client="Cascade Foods", frequency="semi-monthly", pay_day="15th/last", last_pay_date=d(-6), next_pay_date=d(10), cutoff=d(8), ach_release=d(8)),
}

EMPLOYEES: dict[str, dict[str, Any]] = {
    "MHP-20417": dict(contact_id="c1", name="Dana Whitfield", client="Meridian Health Partners", account="a2", pay_group="BW-NUR", state="OH", county="Franklin", phone="+16145550417", email="dana.whitfield@meridianhp.example", ssn_last4="3310", address="412 Maple Ct, Columbus, OH 43215", bank=dict(routing="044000037", account_masked="••••4471", account_last4="4471", status="returned"), hire_date="2021-03-15", status="active"),
    "MHP-20988": dict(contact_id="c2", name="Luis Ortega", client="Meridian Health Partners", account="a2", pay_group="BW-NUR", state="OH", county="Franklin", phone="+16145550988", email="luis.ortega@meridianhp.example", ssn_last4="7742", address="88 Riverside Dr, Columbus, OH 43215", bank=dict(routing="044000037", account_masked="••••0193", account_last4="0193", status="returned"), hire_date="2019-08-02", status="active"),
    "MHP-21102": dict(contact_id="c3", name="Keisha Brown", client="Meridian Health Partners", account="a2", pay_group="BW-NUR", state="OH", county="Franklin", phone="+16145551102", email="keisha.brown@meridianhp.example", ssn_last4="5521", address="19 Linden Ave, Dublin, OH 43017", bank=dict(routing="044000037", account_masked="••••0882", account_last4="0882", status="returned"), hire_date="2022-01-10", status="active"),
    "MHP-19876": dict(contact_id="c4", name="Tom Reilly", client="Meridian Health Partners", account="a2", pay_group="BW-NUR", state="OH", county="Franklin", phone="+16145559876", email="tom.reilly@meridianhp.example", ssn_last4="9104", address="7 Oakview Ln, Westerville, OH 43081", bank=dict(routing="044000037", account_masked="••••0455", account_last4="0455", status="returned"), hire_date="2017-11-20", status="active"),
    "HPL-30544": dict(contact_id="c5", name="Anita Desai", client="Harbor Point Logistics", account="a1", pay_group="SM-CORP", state="NJ", county="Hudson", phone="+12015550544", email="anita.desai@harborpoint.example", ssn_last4="2208", address="300 Harbor Blvd, Jersey City, NJ 07302", bank=dict(routing="021200339", account_masked="••••7781", account_last4="7781", status="ok"), hire_date="2020-06-01", status="active"),
    "NRG-41230": dict(contact_id="c6", name="Marcus Hill", client="Northbridge Retail Group", account="a3", pay_group="SM-HQ", state="IN", county="Hamilton", phone="+13175551230", email="marcus.hill@northbridge.example", ssn_last4="6617", address="1550 Rangeline Rd, Carmel, IN 46032", previous_address="2200 N Clark St, Chicago, IL 60614", move_date="2026-09-28", withholding=dict(state="IL", form="IL-W-4", county_tax=None), bank=dict(routing="071000013", account_masked="••••3390", account_last4="3390", status="ok"), hire_date="2018-04-09", status="active"),
    "CF-51877":  dict(contact_id="c7", name="Elena Petrova", client="Cascade Foods", account="a4", pay_group="WK-PLANT", state="WA", county="King", phone="+12065551877", email="elena.petrova@cascadefoods.example", ssn_last4="4480", address="920 Pine St, Kent, WA 98032", bank=dict(routing="125000024", account_masked="••••9012", account_last4="9012", status="ok"), hire_date="2016-02-22", status="active"),
    "HPL-30912": dict(contact_id="c8", name="Jordan Lee", client="Harbor Point Logistics", account="a1", pay_group="BW-OPS", state="NJ", county="Hudson", phone="+12015550912", email="jordan.lee@harborpoint.example", ssn_last4="1175", address="41 Bay St, Bayonne, NJ 07002", bank=dict(routing="021200339", account_masked="••••5566", account_last4="5566", status="ok"), hire_date="2023-05-15", status="active"),
    "NRG-40777": dict(contact_id="c9", name="Samuel Okafor", client="Northbridge Retail Group", account="a3", pay_group="BW-STORE", state="IL", county="Cook", phone="+13125550777", email="samuel.okafor@northbridge.example", ssn_last4="8830", address="615 W Roosevelt Rd, Chicago, IL 60607", bank=dict(routing="071000013", account_masked="••••2201", account_last4="2201", status="ok"), hire_date="2015-09-01", status="active", role="store manager"),
    "CF-52010":  dict(contact_id="c10", name="Grace Kim", client="Cascade Foods", account="a4", pay_group="SM-OFFICE", state="WA", county="King", phone="+12065552010", email="grace.kim@cascadefoods.example", ssn_last4="0147", address="12 Lakeview Dr, Renton, WA 98056", bank=dict(routing="125000024", account_masked="••••7310", account_last4="7310", status="ok"), hire_date="2019-10-14", status="active", role="client payroll contact"),
    "HPL-30920": dict(contact_id="c14", name="Maria Santos", client="Harbor Point Logistics", account="a1", pay_group="BW-OPS", state="NJ", county="Hudson", phone="+12015550920", email="maria.santos@harborpoint.example", ssn_last4="3321", address="18 Garfield Ave, Jersey City, NJ 07305", bank=dict(routing="021200339", account_masked="••••6072", account_last4="6072", status="ok"), hire_date="2022-03-14", status="active"),
    "HPL-30931": dict(contact_id="c15", name="Derek Cole", client="Harbor Point Logistics", account="a1", pay_group="BW-OPS", state="NJ", county="Hudson", phone="+12015550931", email="derek.cole@harborpoint.example", ssn_last4="7745", address="402 Kennedy Blvd, Bayonne, NJ 07002", bank=dict(routing="021200339", account_masked="••••1189", account_last4="1189", status="ok"), hire_date="2019-08-26", status="active"),
    "HPL-31005": dict(contact_id="c12", name="Victor Nguyen", client="Harbor Point Logistics", account="a1", pay_group="BW-OPS", state="NJ", county="Hudson", phone="+12015551005", email="victor.nguyen@harborpoint.example", ssn_last4="9930", address="77 Summit Ave, Jersey City, NJ 07306", previous_address="5 Grove St, Jersey City, NJ 07302", address_updated="2026-10-07", bank=dict(routing="021200339", account_masked="••••4418", account_last4="4418", status="ok"), hire_date="2021-12-06", status="active"),
}

def _payslip(emp: str, pay_date: str, gross: float, lines: list[dict], hours: float, net_adj: float = 0.0) -> dict:
    deductions = sum(l["amount"] for l in lines if l["kind"] != "earning")
    earnings = sum(l["amount"] for l in lines if l["kind"] == "earning")
    return dict(employee_id=emp, pay_date=pay_date, period_hours=hours, gross=round(earnings, 2), total_deductions=round(deductions, 2), net=round(earnings - deductions + net_adj, 2), lines=lines)

def E(code, desc, amount, hours=None): return dict(kind="earning", code=code, description=desc, amount=amount, **({"hours": hours} if hours else {}))
def T(code, desc, amount): return dict(kind="tax", code=code, description=desc, amount=amount)
def D(code, desc, amount, ref=None): return dict(kind="deduction", code=code, description=desc, amount=amount, **({"ref": ref} if ref else {}))

PAYSLIPS: dict[str, list[dict]] = {
    "MHP-20417": [
        _payslip("MHP-20417", d(0), 0, [E("REG","Regular",2520.00,72), E("OT","Overtime 1.5x",315.00,6), T("FIT","Federal income tax",297.80), T("SS","Social Security",175.77), T("MED","Medicare",41.11), T("OH","Ohio state tax",64.20), T("COL","Columbus city tax",70.88), D("401K","401(k) 5%",141.75), D("MED-P","Medical – employee",102.49)], 78),
        _payslip("MHP-20417", d(-14), 0, [E("REG","Regular",2520.00,72), E("OT","Overtime 1.5x",472.50,9), T("FIT","Federal income tax",324.10), T("SS","Social Security",185.54), T("MED","Medicare",43.39), T("OH","Ohio state tax",69.51), T("COL","Columbus city tax",74.81), D("401K","401(k) 5%",149.63), D("MED-P","Medical – employee",102.49)], 81),
    ],
    "MHP-19876": [
        _payslip("MHP-19876", d(0), 0, [E("REG","Regular",2240.00,80), T("FIT","Federal income tax",221.40), T("SS","Social Security",138.88), T("MED","Medicare",32.48), T("OH","Ohio state tax",51.52), T("COL","Columbus city tax",56.00), D("MED-P","Medical – employee",102.49)], 80),
    ],
    "NRG-41230": [
        _payslip("NRG-41230", d(-6), 0, [E("SAL","Salary",3125.00), T("FIT","Federal income tax",402.10), T("SS","Social Security",193.75), T("MED","Medicare",45.31), T("IL","Illinois state tax",154.69), D("401K","401(k) 6%",187.50), D("MED-P","Medical – employee",118.00)], 86.67),
        _payslip("NRG-41230", d(-21), 0, [E("SAL","Salary",3125.00), T("FIT","Federal income tax",402.10), T("SS","Social Security",193.75), T("MED","Medicare",45.31), T("IL","Illinois state tax",154.69), D("401K","401(k) 6%",187.50), D("MED-P","Medical – employee",118.00)], 86.67),
    ],
    "CF-51877": [
        _payslip("CF-51877", d(-1), 0, [E("REG","Regular",1080.00,40), E("OT","Overtime 1.5x",202.50,5), T("FIT","Federal income tax",118.20), T("SS","Social Security",79.52), T("MED","Medicare",18.60), D("CS","Child support – WA-CS-77821",312.00,"GRN-2291"), D("CS","Child support – WA-CS-77821",312.00,"GRN-2291-B"), D("MED-P","Medical – employee",61.20)], 45),
        _payslip("CF-51877", d(-8), 0, [E("REG","Regular",1080.00,40), E("OT","Overtime 1.5x",81.00,2), T("FIT","Federal income tax",104.90), T("SS","Social Security",71.98), T("MED","Medicare",16.83), D("CS","Child support – WA-CS-77821",312.00,"GRN-2291"), D("MED-P","Medical – employee",61.20)], 42),
    ],
    "HPL-30544": [
        _payslip("HPL-30544", d(-6), 0, [E("SAL","Salary",3750.00), T("FIT","Federal income tax",512.40), T("SS","Social Security",232.50), T("MED","Medicare",54.38), T("NJ","New Jersey state tax",168.75), D("401K","401(k) 6%",225.00), D("MED-P","Medical – employee",140.00)], 86.67),
    ],
    "HPL-31005": [
        _payslip("HPL-31005", d(-7), 0, [E("REG","Regular",1920.00,80), T("FIT","Federal income tax",188.30), T("SS","Social Security",119.04), T("MED","Medicare",27.84), T("NJ","New Jersey state tax",76.80), D("MED-P","Medical – employee",88.00)], 80),
    ],
}
# fill plain payslips for the rest
for emp in EMPLOYEES:
    PAYSLIPS.setdefault(emp, [_payslip(emp, PAY_GROUPS[EMPLOYEES[emp]["pay_group"]]["last_pay_date"], 0, [E("REG","Regular",2000.00,80), T("FIT","Federal income tax",210.00), T("SS","Social Security",124.00), T("MED","Medicare",29.00), D("MED-P","Medical – employee",95.00)], 80)])

# payment status per employee for the last pay date
PAYMENTS: dict[str, dict[str, Any]] = {
    "MHP-20417": dict(pay_date=d(0), method="ACH", amount=2184.37, status="returned", return_code="R03", return_reason="No account / unable to locate account", returned_at=d(0)+"T06:12:00Z", trace="ACH-20261020-004471", remedy=None),
    "MHP-20988": dict(pay_date=d(0), method="ACH", amount=1962.10, status="returned", return_code="R03", return_reason="No account / unable to locate account", returned_at=d(0)+"T06:12:00Z", trace="ACH-20261020-000193", remedy=None),
    "MHP-21102": dict(pay_date=d(0), method="ACH", amount=2310.55, status="returned", return_code="R03", return_reason="No account / unable to locate account", returned_at=d(0)+"T06:12:00Z", trace="ACH-20261020-000882", remedy=None),
    "MHP-19876": dict(pay_date=d(0), method="ACH", amount=1744.90, status="returned", return_code="R03", return_reason="No account / unable to locate account", returned_at=d(0)+"T06:12:00Z", trace="ACH-20261020-000455", remedy=None),
}
for emp in EMPLOYEES:
    PAYMENTS.setdefault(emp, dict(pay_date=PAYSLIPS[emp][0]["pay_date"], method="ACH", amount=PAYSLIPS[emp][0]["net"], status="paid", settled_at=PAYSLIPS[emp][0]["pay_date"]+"T04:30:00Z", trace=f"ACH-{emp}"))

ACH_RETURNS: list[dict] = [dict(employee_id=e, pay_group="BW-NUR", client="Meridian Health Partners", **{k: v for k, v in PAYMENTS[e].items() if k in ("pay_date","amount","return_code","return_reason","returned_at","trace")}) for e in ("MHP-20417","MHP-20988","MHP-21102","MHP-19876")]

TIMESHEETS: list[dict] = [dict(employee_id=f"CF-5{3000+i}", name=n, pay_group="WK-PLANT", period_end=d(4), hours=40 + (i % 3) * 4, status="unapproved", manager="Dale Hoffman") for i, n in enumerate(["R. Alvarez","M. Chen","P. Diaz","K. Evans","S. Fox","L. Garcia","T. Huang","B. Ivers","J. Jones","A. Khan","C. Lopez","D. Moore","E. Nair","F. Olsen"])]

GARNISHMENT_ORDERS: dict[str, list[dict]] = {
    "CF-51877": [
        dict(ref="GRN-2291", external_ref="WA-CS-77821", type="child_support", agency="Washington State DCS", amount=312.00, basis="fixed per weekly pay", status="active", received="2026-03-04", end_date=None, arrears=False, supports_other_family=False),
        dict(ref="GRN-2291-B", external_ref="WA-CS-77821", type="child_support", agency="Washington State DCS", amount=312.00, basis="fixed per weekly pay", status="active", received="2026-10-01", end_date=None, arrears=False, supports_other_family=False, note="Amended order; should have replaced GRN-2291"),
    ]
}

TAX_DOCUMENTS: dict[str, list[dict]] = {emp: [dict(year=2025, type="W-2", status="available", issued="2026-01-28", reissued=None), dict(year=2024, type="W-2", status="available", issued="2025-01-27", reissued=None)] for emp in EMPLOYEES}

STATE_RULES: dict[str, dict[str, Any]] = {
    "IL": dict(withholding_form="IL-W-4", accepts_federal_w4=False, final_pay="Next regular payday (820 ILCS 115/5)", reciprocity=["IA","KY","MI","WI"], county_tax=False),
    "IN": dict(withholding_form="WH-4", accepts_federal_w4=False, final_pay="Next regular payday", reciprocity=["KY","MI","OH","PA","WI"], county_tax=True, county_tax_rule="County of residence on 1 January sets the rate for the whole year"),
    "OH": dict(withholding_form="IT 4", accepts_federal_w4=False, final_pay="Earlier of next regular payday or 15 days", reciprocity=["IN","KY","MI","PA","WV"], county_tax=False, municipal_tax=True),
    "NJ": dict(withholding_form="NJ-W4", accepts_federal_w4=False, final_pay="Next regular payday", reciprocity=["PA"], county_tax=False),
    "WA": dict(withholding_form=None, accepts_federal_w4=None, final_pay="End of the established pay period", reciprocity=[], county_tax=False, note="No state income tax"),
    "CA": dict(withholding_form="DE 4", accepts_federal_w4=False, final_pay="Immediately on involuntary termination; within 72 hours on resignation without notice", reciprocity=[], county_tax=False),
}

ASSIST_CASES: list[dict] = []   # referrals land here

# ---- scenario triggers (what the demo presenter fires; in production these are the real feeds) ----
def post_ach_return_file(pay_group: str, code: str = "R04", reason: str = "Invalid account number", employee_ids: list[str] | None = None) -> list[dict]:
    """A bank return file arrives for a pay group: mark payments returned and return the new entries."""
    pg = PAY_GROUPS[pay_group]
    ids = employee_ids or [e for e, v in EMPLOYEES.items() if v["pay_group"] == pay_group and v.get("role") != "client payroll lead"]
    out = []
    for i, e in enumerate(ids):
        pay_date = pg["last_pay_date"]; amount = PAYSLIPS[e][0]["net"] if e in PAYSLIPS else 2000.00
        PAYMENTS[e] = dict(pay_date=pay_date, method="ACH", amount=amount, status="returned", return_code=code, return_reason=reason, returned_at=now_iso(), trace=f"ACH-{pay_date.replace('-','')}-{1000+i:06d}", remedy=None)
        EMPLOYEES[e]["bank"]["status"] = "returned"
        row = dict(employee_id=e, pay_group=pay_group, client=pg["client"], **{k: v for k, v in PAYMENTS[e].items() if k in ("pay_date","amount","return_code","return_reason","returned_at","trace")}, routing=EMPLOYEES[e]["bank"]["routing"])
        ACH_RETURNS.append(row); out.append(row)
    return out

def set_remedy(employee_id: str, kind: str, reference: str, as_of: str) -> dict:
    """Record the remedy for a returned payment; it settles on a schedule the Day-7 verifier can check against the demo clock."""
    p = PAYMENTS[employee_id]
    dispatched = date.fromisoformat(as_of[:10])
    settle = dispatched + timedelta(days=2) if kind == "live_check" else date.fromisoformat(PAY_GROUPS[EMPLOYEES[employee_id]["pay_group"]]["next_pay_date"])
    p["remedy"] = dict(type=kind, reference=reference, dispatched_at=dispatched.isoformat(), expected_settlement=settle.isoformat())
    return p["remedy"]

def payment_as_of(employee_id: str, as_of: str | None) -> dict:
    """Payment status as the systems would show it on a given day (the demo clock)."""
    p = dict(PAYMENTS[employee_id]); r = p.get("remedy")
    if r and as_of and as_of[:10] >= r["expected_settlement"] and r["type"] == "redeposit" and EMPLOYEES[employee_id]["bank"]["status"] == "returned":
        p["remedy"] = dict(r, status="failed", failed_at=r["expected_settlement"], reason="Redeposit returned again – bank details were not corrected"); p["status"] = "returned"
    elif r and as_of and as_of[:10] >= r["expected_settlement"]:
        p["remedy"] = dict(r, status="settled", settled_at=r["expected_settlement"]); p["status"] = "paid"; p["settled_via"] = r["type"]
    elif r:
        p["remedy"] = dict(r, status="dispatched" if r["type"] == "live_check" else "scheduled")
    return p

def now_iso(): return datetime.now(timezone.utc).isoformat()
AUDIT: list[dict] = []
