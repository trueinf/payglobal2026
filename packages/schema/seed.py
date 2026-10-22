"""Seed for the Strada prototype. All timestamps are relative to now() so the day always reads as 'today'.

Usage:
  python seed.py --sql            # print SQL (apply to Supabase via MCP or psql)
  python seed.py --dsn <DATABASE_URL>   # apply directly
"""
from datetime import date, timedelta
import json, sys

OWNER = "Priya Natarajan"

def q(v):
    if v is None: return "null"
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, (int, float)): return str(v)
    if isinstance(v, list):
        if v and isinstance(v[0], dict): return "'" + json.dumps(v).replace("'", "''") + "'::jsonb"
        return "array[" + ",".join(q(x) for x in v) + "]::text[]" if v else "'{}'::text[]"
    if isinstance(v, dict): return "'" + json.dumps(v).replace("'", "''") + "'::jsonb"
    if isinstance(v, T): return v.sql
    return "'" + str(v).replace("'", "''") + "'"

class T:
    """relative time: T(days_ago, hour, minute) or T.mins(n)"""
    def __init__(self, days_ago=None, h=10, m=0, mins=None):
        if mins is not None:
            self.sql = f"(now() - interval '{mins} minutes')"
        else:
            # today at h:m, but never in the future
            self.sql = f"least(now() - interval '5 minutes', (date_trunc('day', now()) - interval '{days_ago} days' + interval '{h} hours {m} minutes'))" if days_ago >= 0 else f"(date_trunc('day', now()) + interval '{-days_ago} days' + interval '{h} hours {m} minutes')"
    @staticmethod
    def mins(n): return T(mins=n)
    @staticmethod
    def ahead(days, h=17, m=0): return T(days_ago=-days, h=h, m=m)

def ins(table, rows):
    out = []
    for r in rows:
        cols = ",".join(r.keys()); vals = ",".join(q(v) for v in r.values())
        out.append(f"insert into strada.{table} ({cols}) values ({vals});")
    return "\n".join(out)

accounts = [
  dict(id="a1", name="Harbor Point Logistics", pay_groups=["BW-OPS","SM-CORP"], state="NJ", payroll_lead_contact_id="c13"),
  dict(id="a2", name="Meridian Health Partners", pay_groups=["BW-NUR","BW-ADM"], state="OH", payroll_lead_contact_id="c11"),
  dict(id="a3", name="Northbridge Retail Group", pay_groups=["BW-STORE","SM-HQ"], state="IL"),
  dict(id="a4", name="Cascade Foods", pay_groups=["WK-PLANT","SM-OFFICE"], state="WA"),
]
contacts = [
  dict(id="c1", name="Dana Whitfield", account_id="a2", employee_id="MHP-20417", email="dana.whitfield@meridianhp.example", phone="+16145550417", state="OH", pay_group="BW-NUR"),
  dict(id="c2", name="Luis Ortega", account_id="a2", employee_id="MHP-20988", email="luis.ortega@meridianhp.example", phone="+16145550988", state="OH", pay_group="BW-NUR"),
  dict(id="c3", name="Keisha Brown", account_id="a2", employee_id="MHP-21102", email="keisha.brown@meridianhp.example", phone="+16145551102", state="OH", pay_group="BW-NUR"),
  dict(id="c4", name="Tom Reilly", account_id="a2", employee_id="MHP-19876", email="tom.reilly@meridianhp.example", phone="+16145559876", state="OH", pay_group="BW-NUR"),
  dict(id="c5", name="Anita Desai", account_id="a1", employee_id="HPL-30544", email="anita.desai@harborpoint.example", phone="+12015550544", state="NJ", pay_group="SM-CORP"),
  dict(id="c6", name="Marcus Hill", account_id="a3", employee_id="NRG-41230", email="marcus.hill@northbridge.example", phone="+13175551230", state="IN", pay_group="SM-HQ"),
  dict(id="c7", name="Elena Petrova", account_id="a4", employee_id="CF-51877", email="elena.petrova@cascadefoods.example", phone="+12065551877", state="WA", pay_group="WK-PLANT"),
  dict(id="c8", name="Jordan Lee", account_id="a1", employee_id="HPL-30912", email="jordan.lee@harborpoint.example", phone="+12015550912", state="NJ", pay_group="BW-OPS"),
  dict(id="c9", name="Samuel Okafor", account_id="a3", employee_id="NRG-40777", email="samuel.okafor@northbridge.example", phone="+13125550777", state="IL", pay_group="BW-STORE"),
  dict(id="c10", name="Grace Kim", account_id="a4", employee_id="CF-52010", email="grace.kim@cascadefoods.example", phone="+12065552010", state="WA", pay_group="SM-OFFICE"),
  dict(id="c13", name="Nina Patel", account_id="a1", employee_id="HPL-PAYLEAD", email="nina.patel@harborpoint.example", phone="+12015550002", state="NJ", pay_group="Client payroll lead", role="client_lead"),
  dict(id="c14", name="Maria Santos", account_id="a1", employee_id="HPL-30920", email="maria.santos@harborpoint.example", phone="+12015550920", state="NJ", pay_group="BW-OPS"),
  dict(id="c15", name="Derek Cole", account_id="a1", employee_id="HPL-30931", email="derek.cole@harborpoint.example", phone="+12015550931", state="NJ", pay_group="BW-OPS"),
  dict(id="c11", name="Rachel Moreno", account_id="a2", employee_id="MHP-PAYLEAD", email="rachel.moreno@meridianhp.example", phone="+16145550001", state="OH", pay_group="Client payroll lead", role="client_lead"),
  dict(id="c12", name="Victor Nguyen", account_id="a1", employee_id="HPL-31005", email="victor.nguyen@harborpoint.example", phone="+12015551005", state="NJ", pay_group="BW-OPS"),
]
queues = [
  dict(id="q1", name="Pay Distribution"), dict(id="q2", name="Ongoing Processing"), dict(id="q3", name="Tax & Withholding"),
  dict(id="q4", name="Garnishments & Deductions"), dict(id="q5", name="Employee Documents"), dict(id="q6", name="Misroute – Alight Benefits"),
]
scripts = [
  dict(id="s1", name="Bank return (R03) – pay not received", intent="Pay not received – bank return", steps=[
    dict(id="s1a", name="Greet and verify", kind="text", text="Hi {customer}, thank you for contacting Strada Payroll Support for {account}. I can see your employee ID ending {empId}. I'll check the status of your most recent pay now."),
    dict(id="s1b", name="Confirm bank return", kind="text", text="Your direct deposit for pay date {payDate} was returned by the bank with code R03 – no account or unable to locate. This usually means the routing or account number on file has a typo or the account was closed."),
    dict(id="s1c", name="Offer live check", kind="text", text="I can issue a live check today for same-day courier, or re-issue the deposit once you confirm corrected bank details in Strada Pay. Which would you prefer?"),
    dict(id="s1d", name="Update case", kind="macro", action="updateCase"),
    dict(id="s1e", name="Link knowledge article", kind="macro", action="linkArticle"),
    dict(id="s1f", name="Resolve case", kind="macro", action="resolveCase")]),
  dict(id="s2", name="Incident – clustered bank returns", intent="Pay group incident", steps=[
    dict(id="s2a", name="Confirm scope", kind="text", text="Multiple employees in pay group {payGroup} reported missing deposits for {payDate}. Confirm the ACH file status with Treasury before replying to individual employees."),
    dict(id="s2b", name="Notify client payroll lead", kind="text", text="Hi {clientLead}, we have identified an ACH return affecting {count} employees in {payGroup}. Root cause and remediation ETA to follow within 60 minutes. Affected employees will be contacted directly."),
    dict(id="s2c", name="Escalate to Tier 3", kind="macro", action="updateCase"),
    dict(id="s2d", name="Schedule client update", kind="macro", action="scheduleFollowUp")]),
  dict(id="s3", name="W-2 / pay statement reissue", intent="Document request", steps=[
    dict(id="s3a", name="Confirm identity", kind="text", text="Hi {customer}, before I reissue your W-2 I need to confirm the last four digits of your SSN and your mailing address on file."),
    dict(id="s3b", name="Reissue document", kind="text", text="Your {docYear} W-2 has been reissued to the Strada Pay document centre. It will be available for download within 15 minutes; a paper copy can be mailed on request."),
    dict(id="s3c", name="Resolve case", kind="macro", action="resolveCase")]),
  dict(id="s4", name="State move – withholding change", intent="Tax withholding change", steps=[
    dict(id="s4a", name="Confirm move details", kind="text", text="Hi {customer}, I see you moved from {fromState} to {toState} effective {moveDate}. I'll walk you through updating your state withholding."),
    dict(id="s4b", name="Explain forms", kind="text", text="Indiana requires form WH-4 for state and county withholding. Your Illinois IL-W-4 stops applying from the move date. Both can be submitted in Strada Pay › Tax › State withholding."),
    dict(id="s4c", name="Link knowledge article", kind="macro", action="linkArticle"),
    dict(id="s4d", name="Schedule follow-up", kind="macro", action="scheduleFollowUp"),
    dict(id="s4e", name="Resolve case", kind="macro", action="resolveCase")]),
  dict(id="s5", name="Garnishment correction", intent="Garnishment deducted twice", steps=[
    dict(id="s5a", name="Verify deduction", kind="text", text="Hi {customer}, I'm reviewing the deductions on your {payDate} pay statement. I can see two entries for the same child-support order {orderRef}."),
    dict(id="s5b", name="Explain correction", kind="text", text="The duplicate was caused by the order being re-keyed when it was amended. We will refund the second deduction on your next pay and correct the order so it deducts once. The agency has not been over-remitted."),
    dict(id="s5c", name="Update case", kind="macro", action="updateCase"),
    dict(id="s5d", name="Resolve case", kind="macro", action="resolveCase")]),
]

def KA(id, title, snippet, body, kb="Shared rules", audience="Internal", likes=3, views=48, days=12):
    return dict(id=id, title=title, snippet=snippet, body=body, kb=kb, audience=audience, status="Published", likes=likes, views=views, modified=T(days))
articles = [
  KA("KA-01041","Handling an R03 bank return before the next cut-off","An R03 return means the receiving bank could not locate the account. Confirm the return on the ACH report, then offer the employee a live check or a re-deposit once corrected details are on file.",["Check the ACH return report for the pay date; R03 = no account / unable to locate.","Verify the routing and account number the employee entered in Strada Pay. Most R03s are a transposed digit.","Offer a live check (same-day courier before 2 PM ET) or re-deposit after the employee corrects details.","Record the return code, pay date and remedy on the case. Do not re-send the original ACH file."],likes=14,views=322,days=5),
  KA("KA-01044","ACH return codes quick reference","R01 insufficient funds, R02 account closed, R03 no account, R04 invalid account number, R16 account frozen. Each code has a different employee conversation and remedy.",["R01 – Insufficient funds (employer side; escalate to Treasury).","R02 – Account closed; employee must provide a new account.","R03 – No account / unable to locate; usually a typo.","R04 – Invalid account number structure.","R16 – Account frozen; employee must contact their bank."],views=210),
  KA("KA-01052","Live check issuance and courier cut-offs","Live checks can be issued for employees whose deposit was returned. Courier cut-off is 2 PM ET for same-day delivery to the client site.",["Request a live check from the Pay Distribution queue.","Same-day courier cut-off is 2 PM ET; after that, next business day.","The employee's pay statement still shows the original pay date."]),
  KA("KA-01060","Meridian Health Partners – BW-NUR pay calendar and contacts","Bi-weekly nursing pay group. Payroll lead Rachel Moreno. ACH file released T-2 by 11 AM ET.",["Pay group BW-NUR, bi-weekly, Friday pay date.","Client payroll lead: Rachel Moreno.","ACH released T-2 11 AM ET; Treasury contact for returns: Meridian treasury desk."],kb="Meridian Health Partners KB"),
  KA("KA-01073","Incident handling: clustered bank returns in one pay group","Three or more returns in one pay group within an hour indicate a file-level problem, not individual typos. Open a parent case, link the employee cases as children and notify the client payroll lead.",["Open a parent case with Type = Problem and Escalated = Yes.","Link each employee case as a child case.","Notify the client payroll lead within 60 minutes with scope and ETA.","Tier 3 verifies the ACH file; do not offer individual re-deposits until root cause is known."],likes=9,views=97),
  KA("KA-01081","Reissuing a W-2 or pay statement copy","Employees can download reissued W-2s from the Strada Pay document centre. Confirm identity (SSN last four and address) before reissuing.",["Verify SSN last four and mailing address on file.","Reissue from Documents › Tax forms › Reissue; the copy is available within 15 minutes.","Paper copies are mailed within 5 business days on request."],audience="External",views=540,likes=22),
  KA("KA-01085","Harbor Point Logistics – document retention and prior-year W-2s","Prior-year W-2s back to 2021 are available in the document centre; older years require a request to the client HR team.",["Years 2021 onward: self-service download.","Older years: route to Harbor Point HR shared mailbox."],kb="Harbor Point Logistics KB"),
  KA("KA-01092","Mid-year state move: Illinois to Indiana withholding (WH-4)","Indiana uses form WH-4 for state and county withholding. The Illinois IL-W-4 stops applying from the move date. County of residence on 1 January sets the county rate for the year.",["Employee submits WH-4 in Strada Pay › Tax › State withholding.","Set IL withholding end date = day before the move.","Indiana county tax is based on county of residence on 1 January; a mid-year move changes it next year.","Confirm with the employee whether the employer has IN nexus; if not, route to Tax & Withholding."],audience="External",views=188,likes=11),
  KA("KA-01093","State withholding forms by state (2026)","Each state's withholding certificate and whether the federal W-4 is accepted.",["IL – IL-W-4","IN – WH-4","OH – IT 4","NJ – NJ-W4","WA – no state income tax"]),
  KA("KA-01101","Final pay timing rules by state","Final pay deadlines differ by state: California same day for involuntary termination, Illinois next scheduled payday, Ohio within 15 days or next payday.",["CA – immediately on involuntary termination; 72 hours if the employee resigns without notice.","IL – next regular payday.","OH – earlier of next payday or 15 days."]),
  KA("KA-01110","Correcting a duplicated garnishment deduction","A garnishment deducted twice is usually an amended order keyed as a new order. Refund the duplicate on the next pay, end-date the duplicate order and confirm the agency was not over-remitted.",["Compare the two deduction lines: same order reference means a duplicate order, not a second order.","End-date the duplicate order with effective date = the pay period it first deducted.","Refund the duplicate amount on the next regular pay as a non-taxable adjustment.","Check remittance: if the agency received the duplicate, request a credit on the next remittance."],likes=7,views=76,days=3),
  KA("KA-01112","Garnishment limits under the CCPA","Ordinary garnishments are limited to 25% of disposable earnings; child-support orders up to 50–65% depending on dependants and arrears.",["Ordinary creditor: lesser of 25% of disposable earnings or amount above 30 × federal minimum wage.","Child support: 50% (supporting another family) / 60% (not), +5% if more than 12 weeks in arrears."]),
  KA("KA-01120","Benefits, FSA and 401(k) questions – route to Alight","Strada handles payroll only. Benefits enrolment, FSA reimbursements and 401(k) questions remained with Alight after the 2024 separation.",["Confirm the question is about benefits, not a payroll deduction.","Transfer to the Misroute – Alight Benefits queue with the employee's details.","Give the employee the Alight contact line."],audience="External",views=410),
  KA("KA-01131","Cascade Foods – weekly plant pay group WK-PLANT","Weekly pay group paid Thursday; time import from Kronos closes Tuesday 6 PM PT.",["Pay date Thursday.","Kronos import closes Tuesday 6 PM PT; late approvals go to the next week."],kb="Cascade Foods KB"),
  KA("KA-01140","Northbridge Retail Group – store pay group BW-STORE","Bi-weekly store group; many employees across IL/IN/WI with multi-state withholding.",["Stores in IL, IN and WI.","Reciprocity: IL–WI, IN–WI; no IL–IN reciprocity."],kb="Northbridge Retail Group KB"),
]

def C(**k):
    base = dict(type="Problem", product="US Payroll – Direct Deposit", description="", owner=OWNER, escalated=False, first_response_sent=True, article_ids=[], ai_fields=[], suggestions_pending=False)
    base.update(k); base.setdefault("modified_on", base["created_on"]); return base
cases = [
  C(id="k2", number="CAS-10490-INC07", title="Incident: multiple BW-NUR bank returns on current pay date", customer_id="c11", account_id="a2", subject="Pay distribution", priority="High", status="In Progress", origin="Chat", queue_id="q1", created_on=T.mins(41), modified_on=T.mins(6),
    incident=dict(pay_group="BW-NUR", code="R03", affected=["CAS-10492-R03M8","CAS-10493-R03N1","CAS-10494-R03P4","CAS-10495-R03Q9"], root_cause="Workday bank-details import on 10/02 dropped leading zeros from account numbers for the BW-NUR file", confidence="High", action_plan=["Treasury confirms the four R03 returns","Re-key account numbers from the source file","Re-send deposits or issue live checks today","Add leading-zero validation to the import"], client_notified_at=None), created_by="Incident Clustering Agent",
    description="Four employees in Meridian Health Partners pay group BW-NUR reported missing deposits within 60 minutes. Treasury confirms 4 R03 returns on the ACH file released T-2. Root cause under investigation by Tier 3: suspected bank-details import from the Workday feed on 10/02 overwrote account numbers for records with leading zeros.",
    intent="Pay group incident", script_id="s2", escalated=True, escalated_on=T.mins(30), article_ids=["KA-01073","KA-01060"], ai_updated=True, ai_fields=["type","escalated","description"], product="US Payroll – ACH File", first_response_by=T.mins(20), resolve_by=T.ahead(0,17), follow_up_by=T.ahead(0,12),
    summary="Four Meridian Health Partners employees in pay group BW-NUR reported missing direct deposits for the current pay date within one hour. The Case Management Agent clustered the four employee cases under this incident and set Type = Problem, Escalated = Yes. Treasury has confirmed four R03 returns on the ACH file released two days before pay date. Tier 3 suspects the Workday bank-details import on 10/02 dropped leading zeros from account numbers. Client payroll lead Rachel Moreno has been notified with a 60-minute update commitment; a client update call is scheduled for 12:00.",
    highlights=["4 employee cases (Whitfield, Ortega, Brown, Reilly) linked as child cases within 60 minutes.","Treasury confirmed 4 R03 returns on the BW-NUR ACH file.","Suspected root cause: Workday bank-details import on 10/02 dropped leading zeros.","Client payroll lead notified; update call at 12:00; Resolve By 5 PM today."]),
  C(id="k1", number="CAS-10492-R03M8", title="Pay not received – direct deposit returned (R03)", customer_id="c1", account_id="a2", subject="Pay distribution", priority="High", status="In Progress", origin="Chat", queue_id="q1", created_on=T.mins(52), modified_on=T.mins(9),
    description="Employee reports nothing hit her account on pay date. ACH return report shows R03 for MHP-20417, amount 2,184.37. Account number on file ends 4471; employee states her account ends 4417.",
    intent="Pay not received – bank return", script_id="s1", article_ids=["KA-01041","KA-01052"], ai_created=True, ai_fields=["title","subject","priority","product","description"], suggestions_pending=True, parent_id="k2", first_response_by=T.ahead(0,13), resolve_by=T.ahead(1,17), follow_up_by=T.ahead(0,16),
    summary="Dana Whitfield (Meridian Health Partners, pay group BW-NUR) reported that her direct deposit for the current pay date did not arrive. The ACH return report shows return code R03 (no account / unable to locate) for her deposit of 2,184.37. The account number on file ends 4471 while she confirms her account ends 4417, indicating a transposed digit entered during onboarding. She was offered a live check by same-day courier or a re-deposit once corrected details are saved in Strada Pay, and chose the live check. The case is linked to parent incident CAS-10490 because three other BW-NUR employees reported the same issue within the hour.",
    highlights=["Direct deposit of 2,184.37 returned with code R03; account number on file ends 4471, employee's ends 4417.","Employee chose a live check by same-day courier; courier cut-off is 2 PM ET.","Case linked as a child of incident CAS-10490 (BW-NUR cluster) by the Case Management Agent.","Follow-up due today at 4 PM to confirm delivery and corrected bank details."]),
  C(id="k3", number="CAS-10493-R03N1", title="Pay not received – direct deposit returned (R03)", customer_id="c2", account_id="a2", subject="Pay distribution", priority="High", status="In Progress", origin="Chat", queue_id="q1", created_on=T.mins(47), parent_id="k2", intent="Pay not received – bank return", script_id="s1", article_ids=["KA-01041"], ai_created=True, ai_fields=["title","subject","priority","description"], suggestions_pending=True, description="Employee reports missing deposit on pay date. R03 return confirmed for MHP-20988, amount 1,962.10.", resolve_by=T.ahead(1,17),
    summary="Luis Ortega (Meridian Health Partners, BW-NUR) reported a missing direct deposit of 1,962.10 on the current pay date. The ACH return report shows R03. The case was created by the Case Management Agent from the chat and linked to incident CAS-10490.", highlights=["R03 return confirmed for 1,962.10.","Linked to incident CAS-10490.","Awaiting root-cause confirmation before offering a remedy."]),
  C(id="k4", number="CAS-10494-R03P4", title="Pay not received – direct deposit returned (R03)", customer_id="c3", account_id="a2", subject="Pay distribution", priority="High", status="In Progress", origin="Chat", queue_id="q1", created_on=T.mins(44), parent_id="k2", intent="Pay not received – bank return", script_id="s1", article_ids=["KA-01041"], ai_created=True, ai_fields=["title","subject","priority","description"], suggestions_pending=True, description="Employee reports missing deposit on pay date. R03 return confirmed for MHP-21102, amount 2,310.55.", resolve_by=T.ahead(1,17),
    summary="Keisha Brown (Meridian Health Partners, BW-NUR) reported a missing direct deposit of 2,310.55. R03 return confirmed. Case created from chat by the Case Management Agent and linked to incident CAS-10490.", highlights=["R03 return confirmed for 2,310.55.","Linked to incident CAS-10490."]),
  C(id="k5", number="CAS-10495-R03Q9", title="Pay not received – direct deposit returned (R03)", customer_id="c4", account_id="a2", subject="Pay distribution", priority="High", status="In Progress", origin="Phone", queue_id="q1", created_on=T.mins(38), parent_id="k2", intent="Pay not received – bank return", script_id="s1", article_ids=["KA-01041"], ai_created=True, ai_fields=["title","subject","priority","description"], suggestions_pending=True, description="Employee called about a missing deposit. R03 return confirmed for MHP-19876, amount 1,744.90.", resolve_by=T.ahead(1,17),
    summary="Tom Reilly (Meridian Health Partners, BW-NUR) called about a missing direct deposit of 1,744.90. R03 return confirmed. Case created from the voice conversation by the Case Management Agent and linked to incident CAS-10490.", highlights=["R03 return confirmed for 1,744.90.","Linked to incident CAS-10490."]),
  C(id="k13", number="CAS-10458-R03AD", title="Pay not received – direct deposit returned (R03)", customer_id="c5", account_id="a1", subject="Pay distribution", priority="High", status="Resolved", origin="Chat", queue_id="q1", created_on=T(6,8,40), modified_on=T(6,11,5), resolved_on=T(6,11,5), resolution="Problem Solved", intent="Pay not received – bank return", script_id="s1", article_ids=["KA-01041"], ai_created=True, ai_fields=["title","subject","priority","description"],
    description="Employee reported a missing semi-monthly deposit; R03 return confirmed for HPL-30544. Employee corrected the account number in Strada Pay; redeposit scheduled for the next run.", summary="Anita Desai's deposit was returned (R03). She corrected her account number through Strada Pay and the redeposit was scheduled. Resolved pending the Day-7 settlement check.", highlights=["R03 return · 2,977.72 · corrected by the employee", "Redeposit scheduled on the next semi-monthly run", "Day-7 Resolution Verifier will confirm settlement"],
    remedy=dict(type="redeposit", reference="REDEPOSIT-7A41C0", dispatched_at=(date.today() - timedelta(days=6)).isoformat(), expected_settlement=(date.today() - timedelta(days=2)).isoformat())),
  C(id="k14", number="CAS-10497-VAR3K", title="Net pay lower than last period – no change made", customer_id="c9", account_id="a3", subject="Pay statement", priority="Normal", status="In Progress", origin="Chat", queue_id="q2", created_on=T.mins(22), modified_on=T.mins(22), type="Question", product="US Payroll – Pay Statement", intent="Payslip variance", ai_created=True, ai_fields=["title","subject","priority","type","product","description"], suggestions_pending=True,
    description="Employee says his net pay this period is about $260 lower than last period and he did not change anything. Asks for an explanation before the next pay.", summary="Samuel Okafor (Northbridge Retail Group, BW-STORE) asked why his net pay dropped by roughly $260 versus the previous period with no changes on his side.", highlights=["Net pay down ~$260 versus previous period", "Employee reports no changes made", "Payslip comparison pending"], resolve_by=T.ahead(2,17)),
  C(id="k6", number="CAS-10471-W2R2A", title="Request copy of 2025 W-2", customer_id="c5", account_id="a1", subject="Employee documents", priority="Low", status="Resolved", origin="Email", queue_id="q5", created_on=T(1,9,12), modified_on=T(1,9,31), resolved_on=T(1,9,31), type="Request", product="US Payroll – Tax Documents", intent="Document request", script_id="s3", article_ids=["KA-01081","KA-01085"], ai_created=True, ai_updated=True, ai_fields=["title","subject","type","priority","product"], resolution="W-2 reissued; reply sent",
    description="Employee emailed asking for a copy of her 2025 W-2 for a mortgage application. Identity confirmed from the email address on file and SSN last four in the Strada Pay profile.", first_response_by=T(1,13), resolve_by=T(0,9),
    summary="Anita Desai (Harbor Point Logistics) emailed requesting a copy of her 2025 W-2 for a mortgage application. The Case Management Agent created the case from the email and classified it as a document request. Identity was confirmed against the profile on file, the W-2 was reissued to the Strada Pay document centre and a reply email was sent with download instructions. The case was resolved autonomously 19 minutes after the email arrived with no representative action.",
    highlights=["Case created from inbound email by the Case Management Agent.","2025 W-2 reissued to the document centre; reply email sent with download steps.","Resolved autonomously in 19 minutes; no representative action required."]),
  C(id="k7", number="CAS-10478-WH4IN", title="Moved from Illinois to Indiana – state withholding not updated", customer_id="c6", account_id="a3", subject="Tax & withholding", priority="Normal", status="Waiting for Details", origin="Web", queue_id="q3", created_on=T(2,14,5), modified_on=T(0,9,40), type="Question", product="US Payroll – State Tax", intent="Tax withholding change", script_id="s4", article_ids=["KA-01092","KA-01093","KA-01140"], ai_updated=True, ai_fields=["subject","type","product"],
    description="Employee moved from Chicago, IL to Carmel, IN on 09/28. Last pay still withheld Illinois tax. Employee asks what forms are needed and whether Indiana county tax applies this year.", follow_up_by=T.ahead(2,10), first_response_by=T(2,18), resolve_by=T.ahead(5,17),
    summary="Marcus Hill (Northbridge Retail Group, SM-HQ) moved from Illinois to Indiana on 09/28 and his most recent pay still withheld Illinois state tax. The Customer Intent Agent identified the intent as a mid-year state withholding change. He was told that Indiana requires form WH-4 and that Illinois withholding ends the day before the move; Indiana county tax is based on county of residence on 1 January, so it applies from next year. The WH-4 has not yet been submitted in Strada Pay. The Case Management Agent scheduled two follow-ups; the first is due in two days, after which the case closes automatically if the form is on file.",
    highlights=["Moved IL → IN on 09/28; IL withholding still applied on the last pay.","Needs Indiana WH-4; IL-W-4 end-dated 09/27. County tax applies from next year.","Two automated follow-ups scheduled; auto-close when WH-4 is on file.","Article KA-01092 linked to the case."]),
  C(id="k8", number="CAS-10483-GRN2X", title="Child-support garnishment deducted twice on 10/10 pay", customer_id="c7", account_id="a4", subject="Garnishments & deductions", priority="High", status="Researching", origin="Phone", queue_id="q4", created_on=T(3,11,20), modified_on=T(0,8,55), type="Problem", product="US Payroll – Garnishments", intent="Garnishment deducted twice", script_id="s5", article_ids=["KA-01110","KA-01112"],
    description="Employee's 10/10 pay statement shows two deductions of 312.00 for child-support order WA-CS-77821. Amended order received 10/01 was keyed as a new order instead of replacing the original.", first_response_by=T(3,15), follow_up_by=T.ahead(0,15), resolve_by=T.ahead(1,17),
    summary="Elena Petrova (Cascade Foods, WK-PLANT) called because her 10/10 pay statement shows two child-support deductions of 312.00 for the same order WA-CS-77821. Research shows the amended order received on 10/01 was keyed as a new order instead of replacing the original, so both deducted. The remedy is to end-date the duplicate order, refund 312.00 on the next weekly pay as a non-taxable adjustment and confirm with the Washington DCS that only one remittance was sent. The refund is approved; the remittance check with the agency is outstanding.",
    highlights=["Two deductions of 312.00 for order WA-CS-77821 on the 10/10 pay.","Cause: amended order keyed as a new order on 10/01.","Refund of 312.00 approved for the next weekly pay; duplicate order end-dated.","Outstanding: confirm single remittance with Washington DCS."]),
  C(id="k9", number="CAS-10466-FSA01", title="FSA reimbursement not received", customer_id="c8", account_id="a1", subject="Benefits – misroute", priority="Low", status="On Hold", origin="Chat", queue_id="q6", created_on=T(4,16,2), modified_on=T(4,16,20), type="Question", product="Benefits (Alight)", intent="Benefits misroute", article_ids=["KA-01120"],
    description="Employee asked about an FSA reimbursement. FSA administration sits with Alight; transferred with employee details.", resolve_by=T.ahead(3,17),
    summary="Jordan Lee (Harbor Point Logistics) asked why an FSA reimbursement had not arrived. FSA administration is handled by Alight, not Strada Payroll. The case was transferred to the Misroute – Alight Benefits queue with the employee's details and the employee was given the Alight contact line.", highlights=["Benefits question, not payroll; transferred to Alight.","Employee given the Alight contact line."]),
  C(id="k10", number="CAS-10461-FPIL1", title="Final pay for terminated store associate – timing", customer_id="c9", account_id="a3", subject="Ongoing processing", priority="Normal", status="In Progress", origin="Email", queue_id="q2", created_on=T(5,10,30), modified_on=T(1,14,10), type="Question", product="US Payroll – Off-cycle", intent="Final pay timing", article_ids=["KA-01101"],
    description="Store manager asks when the final pay for an associate terminated 10/13 must be issued under Illinois rules.", resolve_by=T.ahead(1,17),
    summary="Samuel Okafor (Northbridge Retail Group, BW-STORE) emailed asking when final pay is due for an associate terminated on 10/13. Under Illinois rules final pay is due by the next regular payday, which is 10/24 for BW-STORE. An off-cycle check is not required unless the client requests it.", highlights=["Illinois: final pay due by next regular payday (10/24).","Off-cycle only if the client requests it."]),
  C(id="k11", number="CAS-10455-TIME3", title="Kronos hours import rejected – 14 employees", customer_id="c10", account_id="a4", subject="Ongoing processing", priority="Normal", status="In Progress", origin="Email", queue_id="q2", created_on=T(6,8,15), modified_on=T(2,9,0), type="Problem", product="US Payroll – Time Import", intent="Time import failure", article_ids=["KA-01131"],
    description="Weekly Kronos import for WK-PLANT rejected 14 records with unapproved time. Client payroll contact asked to approve before the Tuesday 6 PM cut-off.", resolve_by=T.ahead(0,18),
    summary="Grace Kim (Cascade Foods) reported that the weekly Kronos import for WK-PLANT rejected 14 records because time was unapproved. The client was asked to approve the records before the Tuesday 6 PM PT cut-off so they are included in Thursday's pay.", highlights=["14 records rejected: unapproved time.","Client to approve before Tuesday 6 PM PT."]),
  C(id="k12", number="CAS-10449-ADDR9", title="Address change not reflected on pay statement", customer_id="c12", account_id="a1", subject="Employee data", priority="Low", status="In Progress", origin="Web", queue_id="q2", created_on=T(8,13,45), modified_on=T(7,9,0), type="Request", product="US Payroll – Employee Data", intent="Employee data change",
    description="Employee updated his address in Workday on 10/05 but the pay statement still shows the old address.", resolve_by=T.ahead(2,17),
    summary="Victor Nguyen (Harbor Point Logistics, BW-OPS) updated his address in Workday on 10/05 but his pay statement still shows the old address. The Workday integration runs nightly; the change was confirmed in Strada Pay on 10/07 and will appear on the next statement.", highlights=["Address updated in Workday 10/05; synced to Strada Pay 10/07.","Next pay statement will show the new address."]),
]

def A(**k):
    base = dict(ai_generated=False); base.update(k); base.setdefault("modified_at", base["at"]); return base
CMA = "Case Management Agent"
activities = [
  A(id="t1", case_id="k1", type="chat", from_name="Dana Whitfield", subject="Nothing hit my account", at=T.mins(52), status="Closed", transcript=[
    dict(who="Dana Whitfield", text="Hi, it's pay day and nothing has hit my account. My colleagues got paid.", at="9:38 AM"),
    dict(who="Strada Pay assistant", text="I'm sorry to hear that, Dana. I've verified your identity from the code we sent to your phone. Let me check the status of your deposit.", at="9:38 AM"),
    dict(who="Strada Pay assistant", text="Your deposit of $2,184.37 was returned by your bank with code R03, which means the bank could not locate the account. The account number on file ends in 4471. Does that match your account?", at="9:39 AM"),
    dict(who="Dana Whitfield", text="No! My account ends in 4417. Someone must have typed it wrong.", at="9:39 AM"),
    dict(who="Strada Pay assistant", text="Thank you. I can issue a live check by same-day courier to the Meridian Health Partners site, or re-send the deposit once you correct the account number in Strada Pay. Which would you prefer?", at="9:40 AM"),
    dict(who="Dana Whitfield", text="Live check please, I need the money today.", at="9:40 AM"),
    dict(who="Strada Pay assistant", text="Done. A live check for $2,184.37 will be couriered today; you'll get a text when it's dispatched. I've created case CAS-10492 and a payroll specialist will follow up this afternoon.", at="9:41 AM")]),
  A(id="t2", case_id="k1", type="note", from_name=CMA, agent=CMA, subject="Conversation summary", at=T.mins(50), ai_generated=True, body="Employee reported missing deposit on pay date. R03 return confirmed for $2,184.37. Account number on file ends 4471; employee confirms 4417. Employee chose live check by same-day courier. Case fields populated from the conversation."),
  A(id="t3", case_id="k1", type="autopost", from_name=CMA, agent="Incident Clustering Agent", subject="Case linked to parent CAS-10490", at=T.mins(35), ai_generated=True, body="Three further R03 returns detected in pay group BW-NUR within 60 minutes. This case was linked as a child of incident CAS-10490."),
  A(id="t4", case_id="k1", type="task", from_name=OWNER, subject="Confirm live check dispatched and corrected bank details saved", at=T.mins(9), status="Open", due=T.ahead(0,16)),
  A(id="t5", case_id="k1", type="email", direction="out", from_name=OWNER, subject="Your pay for today – live check on its way", at=T.mins(9), body="Hi Dana, confirming that a live check for $2,184.37 is being couriered to the Meridian Health Partners site today. Please update your account number in Strada Pay › Pay › Direct deposit so future deposits go through. — Priya, Strada Payroll Support"),
  A(id="t6", case_id="k2", type="autopost", from_name="Incident Clustering Agent", agent="Incident Clustering Agent", subject="Incident created from 4 related cases", at=T.mins(41), ai_generated=True, body="Four cases with intent 'Pay not received – bank return' in pay group BW-NUR within 60 minutes. Parent case created; Type = Problem, Escalated = Yes."),
  A(id="t7", case_id="k2", type="email", direction="out", from_name=OWNER, subject="BW-NUR direct deposit returns – initial notification", at=T.mins(30), body="Hi Rachel, we have identified ACH returns affecting 4 employees in BW-NUR for today's pay date. Treasury has confirmed the returns and Tier 3 is investigating the bank-details feed from 10/02. Root cause and remediation ETA within 60 minutes. Affected employees are being contacted directly and offered live checks. — Priya"),
  A(id="t8", case_id="k2", type="call", from_name="Rachel Moreno", subject="Acknowledged notification; asked for list of affected employees", at=T.mins(22), status="Closed", body="Rachel acknowledged. Asked for the list of affected employees and confirmation that no other pay groups are affected. Confirmed BW-ADM file clean."),
  A(id="t9", case_id="k2", type="appointment", from_name=OWNER, subject="Client update call – BW-NUR incident", at=T.ahead(0,12), status="Open", due=T.ahead(0,12,30)),
  A(id="t10", case_id="k2", type="note", from_name="Tier 3 – Ravi Menon", subject="Root cause update", at=T.mins(6), body="Workday bank-details import on 10/02 dropped leading zeros on 4 account numbers (all starting 0). Fix: re-import with string typing; corrected details to Treasury for re-deposit on Monday. Live checks today for all 4."),
  A(id="t11", case_id="k3", type="chat", from_name="Luis Ortega", subject="Missing pay today", at=T.mins(47), status="Closed", transcript=[dict(who="Luis Ortega", text="My pay didn't come in today.", at="9:43 AM"), dict(who="Strada Pay assistant", text="I'm sorry, Luis. Your deposit of $1,962.10 was returned with code R03. A specialist is looking into a wider issue affecting your pay group and will contact you within the hour.", at="9:44 AM")]),
  A(id="t12", case_id="k3", type="note", from_name=CMA, agent=CMA, subject="Conversation summary", at=T.mins(46), ai_generated=True, body="R03 return confirmed for $1,962.10. Linked to incident CAS-10490."),
  A(id="t13", case_id="k4", type="chat", from_name="Keisha Brown", subject="No deposit", at=T.mins(44), status="Closed", transcript=[dict(who="Keisha Brown", text="Hello, I haven't been paid.", at="9:46 AM"), dict(who="Strada Pay assistant", text="I'm sorry, Keisha. Your deposit of $2,310.55 was returned by the bank (R03). This is affecting several colleagues and a specialist will be in touch within the hour.", at="9:47 AM")]),
  A(id="t14", case_id="k5", type="call", from_name="Tom Reilly", subject="Called about missing deposit", at=T.mins(38), status="Closed", body="Voice agent verified identity; R03 return confirmed for $1,744.90; employee informed of incident and live check option."),
  A(id="t15", case_id="k6", type="email", direction="in", from_name="Anita Desai", subject="Copy of my 2025 W-2", at=T(1,9,12), body="Hello, I need a copy of my 2025 W-2 for a mortgage application. Could you send it or tell me where to download it? Thanks, Anita Desai (HPL-30544)"),
  A(id="t16", case_id="k6", type="autopost", from_name=CMA, agent=CMA, subject="Case created from email", at=T(1,9,13), ai_generated=True, body="Case created from inbound email. Intent: Document request. Fields populated: Title, Subject, Type, Priority, Product."),
  A(id="t17", case_id="k6", type="note", from_name=CMA, agent=CMA, subject="Identity confirmed; W-2 reissued", at=T(1,9,20), ai_generated=True, body="Email address matches profile on file. SSN last four verified against profile. 2025 W-2 reissued to the Strada Pay document centre (available within 15 minutes)."),
  A(id="t18", case_id="k6", type="email", direction="out", from_name="Strada Payroll Support", agent=CMA, subject="RE: Copy of my 2025 W-2", at=T(1,9,26), ai_generated=True, body="Hi Anita, your 2025 W-2 has been reissued and is available to download from Strada Pay › Documents › Tax forms. It will appear within 15 minutes. If you need a paper copy mailed to your address on file, reply to this email. — Strada Payroll Support"),
  A(id="t19", case_id="k6", type="autopost", from_name=CMA, agent=CMA, subject="Case resolved", at=T(1,9,31), ai_generated=True, body="Resolution: W-2 reissued; reply sent. Resolved autonomously."),
  A(id="t20", case_id="k7", type="email", direction="in", from_name="Marcus Hill", subject="Moved to Indiana – still paying Illinois tax", at=T(2,14,5), body="Hi, I moved from Chicago to Carmel, IN on Sept 28 and updated my address, but my last paycheck still took Illinois state tax. What do I need to do? Does Indiana county tax apply now?"),
  A(id="t21", case_id="k7", type="autopost", from_name="Customer Intent Agent", agent="Customer Intent Agent", subject="Intent identified: Tax withholding change (state move)", at=T(2,14,6), ai_generated=True, body="Recommended article: KA-01092 Mid-year state move: Illinois to Indiana withholding (WH-4)."),
  A(id="t22", case_id="k7", type="email", direction="out", from_name=OWNER, subject="RE: Moved to Indiana – still paying Illinois tax", at=T(2,16,40), body="Hi Marcus, thanks for letting us know. Indiana requires form WH-4 for state and county withholding; Illinois withholding will be end-dated 09/27. Please submit the WH-4 in Strada Pay › Tax › State withholding. Indiana county tax is based on your county of residence on 1 January, so it applies from next year. We'll check back in a few days to confirm the form is on file. — Priya"),
  A(id="t23", case_id="k7", type="task", from_name=CMA, agent=CMA, subject="Follow-up 1: confirm WH-4 submitted", at=T(0,9,40), status="Open", due=T.ahead(2,10), ai_generated=True),
  A(id="t24", case_id="k7", type="task", from_name=CMA, agent=CMA, subject="Follow-up 2: auto-close if WH-4 on file", at=T(0,9,40), status="Open", due=T.ahead(5,10), ai_generated=True),
  A(id="t25", case_id="k8", type="call", from_name="Elena Petrova", subject="Two child-support deductions on my pay", at=T(3,11,20), status="Closed", body="Employee reports two deductions of $312.00 on the 10/10 statement for order WA-CS-77821. Verified identity. Advised research needed; promised update within 2 business days."),
  A(id="t26", case_id="k8", type="note", from_name=OWNER, subject="Research: duplicate order", at=T(2,15,0), body="Amended order received 10/01 was keyed as a new order (GRN-2291-B) instead of replacing GRN-2291. Both active on 10/10. Remittance file shows two lines to WA DCS — need to confirm whether both were sent."),
  A(id="t27", case_id="k8", type="appointment", from_name=OWNER, subject="Call Elena with resolution", at=T(1,15,0), status="Overdue", due=T(1,15,30)),
  A(id="t28", case_id="k8", type="task", from_name=OWNER, subject="Confirm single remittance with Washington DCS", at=T(0,8,55), status="Open", due=T.ahead(0,15)),
  A(id="t29", case_id="k9", type="chat", from_name="Jordan Lee", subject="FSA reimbursement", at=T(4,16,2), status="Closed", transcript=[dict(who="Jordan Lee", text="My FSA reimbursement hasn't arrived.", at="4:02 PM"), dict(who="Strada Pay assistant", text="FSA reimbursements are handled by Alight. I've passed your details to them and you can reach them on the Alight benefits line.", at="4:03 PM")]),
  A(id="t30", case_id="k10", type="email", direction="in", from_name="Samuel Okafor", subject="Final pay for terminated associate", at=T(5,10,30), body="When does the final pay need to go out for an associate terminated 10/13 (IL store)?"),
  A(id="t31", case_id="k10", type="email", direction="out", from_name=OWNER, subject="RE: Final pay for terminated associate", at=T(1,14,10), body="Hi Samuel, under Illinois rules final pay is due by the next regular payday, 10/24 for BW-STORE. We can run an off-cycle check earlier if you'd like. — Priya"),
  A(id="t32", case_id="k11", type="email", direction="in", from_name="Grace Kim", subject="Kronos import rejected 14 records", at=T(6,8,15), body="The WK-PLANT import rejected 14 records. Can you tell me which ones?"),
  A(id="t33", case_id="k11", type="task", from_name=OWNER, subject="Confirm 14 records approved before Tuesday cut-off", at=T(2,9,0), status="Open", due=T.ahead(0,18)),
  A(id="t34", case_id="k12", type="note", from_name=OWNER, subject="Workday sync confirmed", at=T(7,9,0), body="Address change synced 10/07. Will show on next statement."),
]

conversations = [
  dict(id="cv1", channel="voice", state="Closed", customer_id="c4", case_id="k5", queue_id="q1", started_at=T.mins(38), accepted_at=T.mins(36), ended_at=T.mins(31), closed_at=T.mins(30), waiting_seconds=94, sentiment="Neutral", intent="Pay not received – bank return", disposition_code="Bank return – live check issued", assigned_to="Priya Natarajan", transferred_by="Copilot voice agent", handled_by_assistant=True),
]
transcript = [
  ("Voice agent", "Thank you for calling Strada Payroll Support. To verify your identity I've sent a code to the mobile number on file. Please say the six digits."),
  ("Customer", "Four two seven one nine three."),
  ("Voice agent", "Thanks, Tom. How can I help today?"),
  ("Customer", "My pay didn't come in this morning. Everyone else on my unit got paid."),
  ("Voice agent", "I'm sorry about that. I can see your deposit of one thousand seven hundred forty-four dollars and ninety cents was returned by your bank with code R03, which means the bank could not locate the account. I've opened case CAS-10495 for you. I can issue a live check by courier today, or re-send the deposit once you correct your account number in Strada Pay."),
  ("Customer", "I'd rather talk to a person about this."),
  ("Voice agent", "Of course. I'm transferring you to a payroll specialist now and passing along everything we've discussed. Please hold."),
  ("System", "Transferred to queue Pay Distribution with context. Waiting for a representative."),
]

def build_sql():
    parts = ["set search_path to strada, public;",
             "truncate strada.transcript_lines, strada.conversations, strada.referrals, strada.alerts, strada.agent_runs, strada.events, strada.activities, strada.cases, strada.knowledge_articles, strada.agent_scripts, strada.contacts, strada.accounts, strada.queues restart identity cascade;",
             ins("accounts", [{k: v for k, v in a.items() if k != "payroll_lead_contact_id"} for a in accounts]),
             ins("queues", queues), ins("contacts", contacts),
             "update strada.accounts set payroll_lead_contact_id='c11' where id='a2';",
             ins("agent_scripts", scripts), ins("knowledge_articles", articles)]
    # parents first
    parts.append(ins("cases", [c for c in cases if "parent_id" not in c]))
    parts.append(ins("cases", [c for c in cases if "parent_id" in c]))
    parts.append(ins("activities", activities))
    parts.append(ins("conversations", conversations))
    parts.append(ins("transcript_lines", [dict(conversation_id="cv1", who=w, text=t, at=T.mins(38 - i)) for i, (w, t) in enumerate(transcript)]))
    # keep modified_on as seeded (activities trigger bumps it)
    parts.append("update strada.cases c set modified_on = v.m from (values " + ",".join(f"('{c['id']}', {c['modified_on'].sql})" for c in cases) + ") as v(id, m) where c.id = v.id;")
    parts.append("insert into strada.events(type, payload, source) values ('ach.returned', '{\"pay_group\":\"BW-NUR\",\"count\":4,\"code\":\"R03\"}', 'strada-sys');")
    return "\n".join(parts)

if __name__ == "__main__":
    sql = build_sql()
    if "--sql" in sys.argv:
        print(sql)
    elif "--dsn" in sys.argv:
        import psycopg
        with psycopg.connect(sys.argv[sys.argv.index("--dsn") + 1]) as conn:
            conn.execute(sql); conn.commit()
        print("seeded")
    else:
        print(__doc__)
