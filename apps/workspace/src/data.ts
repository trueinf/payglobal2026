import type { Account, Activity, AgentScript, Case, Contact, KnowledgeArticle, Queue } from "./model";

const now = new Date();
const d = (daysAgo: number, h = 10, m = 0) => { const x = new Date(now); x.setDate(x.getDate() - daysAgo); x.setHours(h, m, 0, 0); if (daysAgo >= 0 && x > now) x.setTime(now.getTime() - (5 + h) * 60000); return x; };
const ahead = (days: number, h = 17, m = 0) => d(-days, h, m);
const minsAgo = (mins: number) => new Date(now.getTime() - mins * 60000);

export const OWNER = "Priya Natarajan";

export const accounts: Account[] = [
  { id: "a1", name: "Harbor Point Logistics", payGroups: ["BW-OPS", "SM-CORP"], state: "NJ" },
  { id: "a2", name: "Meridian Health Partners", payGroups: ["BW-NUR", "BW-ADM"], state: "OH" },
  { id: "a3", name: "Northbridge Retail Group", payGroups: ["BW-STORE", "SM-HQ"], state: "IL" },
  { id: "a4", name: "Cascade Foods", payGroups: ["WK-PLANT", "SM-OFFICE"], state: "WA" },
];

export const contacts: Contact[] = [
  { id: "c1", name: "Dana Whitfield", accountId: "a2", employeeId: "MHP-20417", email: "dana.whitfield@meridianhp.example", state: "OH", payGroup: "BW-NUR" },
  { id: "c2", name: "Luis Ortega", accountId: "a2", employeeId: "MHP-20988", email: "luis.ortega@meridianhp.example", state: "OH", payGroup: "BW-NUR" },
  { id: "c3", name: "Keisha Brown", accountId: "a2", employeeId: "MHP-21102", email: "keisha.brown@meridianhp.example", state: "OH", payGroup: "BW-NUR" },
  { id: "c4", name: "Tom Reilly", accountId: "a2", employeeId: "MHP-19876", email: "tom.reilly@meridianhp.example", state: "OH", payGroup: "BW-NUR" },
  { id: "c5", name: "Anita Desai", accountId: "a1", employeeId: "HPL-30544", email: "anita.desai@harborpoint.example", state: "NJ", payGroup: "SM-CORP" },
  { id: "c6", name: "Marcus Hill", accountId: "a3", employeeId: "NRG-41230", email: "marcus.hill@northbridge.example", state: "IN", payGroup: "SM-HQ" },
  { id: "c7", name: "Elena Petrova", accountId: "a4", employeeId: "CF-51877", email: "elena.petrova@cascadefoods.example", state: "WA", payGroup: "WK-PLANT" },
  { id: "c8", name: "Jordan Lee", accountId: "a1", employeeId: "HPL-30912", email: "jordan.lee@harborpoint.example", state: "NJ", payGroup: "BW-OPS" },
  { id: "c9", name: "Samuel Okafor", accountId: "a3", employeeId: "NRG-40777", email: "samuel.okafor@northbridge.example", state: "IL", payGroup: "BW-STORE" },
  { id: "c10", name: "Grace Kim", accountId: "a4", employeeId: "CF-52010", email: "grace.kim@cascadefoods.example", state: "WA", payGroup: "SM-OFFICE" },
  { id: "c11", name: "Rachel Moreno", accountId: "a2", employeeId: "MHP-PAYLEAD", email: "rachel.moreno@meridianhp.example", state: "OH", payGroup: "Client payroll lead" },
  { id: "c12", name: "Victor Nguyen", accountId: "a1", employeeId: "HPL-31005", email: "victor.nguyen@harborpoint.example", state: "NJ", payGroup: "BW-OPS" },
  { id: "c13", name: "Nina Patel", accountId: "a1", employeeId: "HPL-PAYLEAD", email: "nina.patel@harborpoint.example", state: "NJ", payGroup: "Client payroll lead" },
  { id: "c14", name: "Maria Santos", accountId: "a1", employeeId: "HPL-30920", email: "maria.santos@harborpoint.example", state: "NJ", payGroup: "BW-OPS" },
  { id: "c15", name: "Derek Cole", accountId: "a1", employeeId: "HPL-30931", email: "derek.cole@harborpoint.example", state: "NJ", payGroup: "BW-OPS" },
];

export const queues: Queue[] = [
  { id: "q1", name: "Pay Distribution" },
  { id: "q2", name: "Ongoing Processing" },
  { id: "q3", name: "Tax & Withholding" },
  { id: "q4", name: "Garnishments & Deductions" },
  { id: "q5", name: "Employee Documents" },
  { id: "q6", name: "Misroute – Alight Benefits" },
];

export const scripts: AgentScript[] = [
  { id: "s1", name: "Bank return (R03) – pay not received", intent: "Pay not received – bank return", steps: [
    { id: "s1a", name: "Greet and verify", kind: "text", text: "Hi {customer}, thank you for contacting Strada Payroll Support for {account}. I can see your employee ID ending {empId}. I'll check the status of your most recent pay now." },
    { id: "s1b", name: "Confirm bank return", kind: "text", text: "Your direct deposit for pay date {payDate} was returned by the bank with code R03 – no account or unable to locate. This usually means the routing or account number on file has a typo or the account was closed." },
    { id: "s1c", name: "Offer live check", kind: "text", text: "I can issue a live check today for same-day courier, or re-issue the deposit once you confirm corrected bank details in Strada Pay. Which would you prefer?" },
    { id: "s1d", name: "Update case", kind: "macro", action: "updateCase" },
    { id: "s1e", name: "Link knowledge article", kind: "macro", action: "linkArticle" },
    { id: "s1f", name: "Resolve case", kind: "macro", action: "resolveCase" },
  ]},
  { id: "s2", name: "Incident – clustered bank returns", intent: "Pay group incident", steps: [
    { id: "s2a", name: "Confirm scope", kind: "text", text: "Multiple employees in pay group {payGroup} reported missing deposits for {payDate}. Confirm the ACH file status with Treasury before replying to individual employees." },
    { id: "s2b", name: "Notify client payroll lead", kind: "text", text: "Hi {clientLead}, we have identified an ACH return affecting {count} employees in {payGroup}. Root cause and remediation ETA to follow within 60 minutes. Affected employees will be contacted directly." },
    { id: "s2c", name: "Escalate to Tier 3", kind: "macro", action: "updateCase" },
    { id: "s2d", name: "Schedule client update", kind: "macro", action: "scheduleFollowUp" },
  ]},
  { id: "s3", name: "W-2 / pay statement reissue", intent: "Document request", steps: [
    { id: "s3a", name: "Confirm identity", kind: "text", text: "Hi {customer}, before I reissue your W-2 I need to confirm the last four digits of your SSN and your mailing address on file." },
    { id: "s3b", name: "Reissue document", kind: "text", text: "Your {docYear} W-2 has been reissued to the Strada Pay document centre. It will be available for download within 15 minutes; a paper copy can be mailed on request." },
    { id: "s3c", name: "Resolve case", kind: "macro", action: "resolveCase" },
  ]},
  { id: "s4", name: "State move – withholding change", intent: "Tax withholding change", steps: [
    { id: "s4a", name: "Confirm move details", kind: "text", text: "Hi {customer}, I see you moved from {fromState} to {toState} effective {moveDate}. I'll walk you through updating your state withholding." },
    { id: "s4b", name: "Explain forms", kind: "text", text: "Indiana requires form WH-4 for state and county withholding. Your Illinois IL-W-4 stops applying from the move date. Both can be submitted in Strada Pay › Tax › State withholding." },
    { id: "s4c", name: "Link knowledge article", kind: "macro", action: "linkArticle" },
    { id: "s4d", name: "Schedule follow-up", kind: "macro", action: "scheduleFollowUp" },
    { id: "s4e", name: "Resolve case", kind: "macro", action: "resolveCase" },
  ]},
  { id: "s5", name: "Garnishment correction", intent: "Garnishment deducted twice", steps: [
    { id: "s5a", name: "Verify deduction", kind: "text", text: "Hi {customer}, I'm reviewing the deductions on your {payDate} pay statement. I can see two entries for the same child-support order {orderRef}." },
    { id: "s5b", name: "Explain correction", kind: "text", text: "The duplicate was caused by the order being re-keyed when it was amended. We will refund the second deduction on your next pay and correct the order so it deducts once. The agency has not been over-remitted." },
    { id: "s5c", name: "Update case", kind: "macro", action: "updateCase" },
    { id: "s5d", name: "Resolve case", kind: "macro", action: "resolveCase" },
  ]},
];

const KA = (id: string, title: string, snippet: string, body: string[], kb: string, extra: Partial<KnowledgeArticle> = {}): KnowledgeArticle => ({
  id, title, snippet, body, kb, audience: "Internal", status: "Published", likes: 3, views: 48, modified: d(12), ...extra,
});

export const articles: KnowledgeArticle[] = [
  KA("KA-01041", "Handling an R03 bank return before the next cut-off", "An R03 return means the receiving bank could not locate the account. Confirm the return on the ACH report, then offer the employee a live check or a re-deposit once corrected details are on file.", [
    "Check the ACH return report for the pay date; R03 = no account / unable to locate.",
    "Verify the routing and account number the employee entered in Strada Pay. Most R03s are a transposed digit.",
    "Offer a live check (same-day courier before 2 PM ET) or re-deposit after the employee corrects details.",
    "Record the return code, pay date and remedy on the case. Do not re-send the original ACH file.",
  ], "Shared rules", { likes: 14, views: 322, modified: d(5) }),
  KA("KA-01044", "ACH return codes quick reference", "R01 insufficient funds, R02 account closed, R03 no account, R04 invalid account number, R16 account frozen. Each code has a different employee conversation and remedy.", ["R01 – Insufficient funds (employer side; escalate to Treasury).", "R02 – Account closed; employee must provide a new account.", "R03 – No account / unable to locate; usually a typo.", "R04 – Invalid account number structure.", "R16 – Account frozen; employee must contact their bank."], "Shared rules", { views: 210 }),
  KA("KA-01052", "Live check issuance and courier cut-offs", "Live checks can be issued for employees whose deposit was returned. Courier cut-off is 2 PM ET for same-day delivery to the client site.", ["Request a live check from the Pay Distribution queue.", "Same-day courier cut-off is 2 PM ET; after that, next business day.", "The employee's pay statement still shows the original pay date."], "Shared rules"),
  KA("KA-01060", "Meridian Health Partners – BW-NUR pay calendar and contacts", "Bi-weekly nursing pay group. Payroll lead Rachel Moreno. ACH file released T-2 by 11 AM ET.", ["Pay group BW-NUR, bi-weekly, Friday pay date.", "Client payroll lead: Rachel Moreno.", "ACH released T-2 11 AM ET; Treasury contact for returns: Meridian treasury desk."], "Meridian Health Partners KB", { audience: "Internal" }),
  KA("KA-01073", "Incident handling: clustered bank returns in one pay group", "Three or more returns in one pay group within an hour indicate a file-level problem, not individual typos. Open a parent case, link the employee cases as children and notify the client payroll lead.", ["Open a parent case with Type = Problem and Escalated = Yes.", "Link each employee case as a child case.", "Notify the client payroll lead within 60 minutes with scope and ETA.", "Tier 3 verifies the ACH file; do not offer individual re-deposits until root cause is known."], "Shared rules", { likes: 9, views: 97 }),
  KA("KA-01081", "Reissuing a W-2 or pay statement copy", "Employees can download reissued W-2s from the Strada Pay document centre. Confirm identity (SSN last four and address) before reissuing.", ["Verify SSN last four and mailing address on file.", "Reissue from Documents › Tax forms › Reissue; the copy is available within 15 minutes.", "Paper copies are mailed within 5 business days on request."], "Shared rules", { audience: "External", views: 540, likes: 22 }),
  KA("KA-01085", "Harbor Point Logistics – document retention and prior-year W-2s", "Prior-year W-2s back to 2021 are available in the document centre; older years require a request to the client HR team.", ["Years 2021 onward: self-service download.", "Older years: route to Harbor Point HR shared mailbox."], "Harbor Point Logistics KB"),
  KA("KA-01092", "Mid-year state move: Illinois to Indiana withholding (WH-4)", "Indiana uses form WH-4 for state and county withholding. The Illinois IL-W-4 stops applying from the move date. County of residence on 1 January sets the county rate for the year.", ["Employee submits WH-4 in Strada Pay › Tax › State withholding.", "Set IL withholding end date = day before the move.", "Indiana county tax is based on county of residence on 1 January; a mid-year move changes it next year.", "Confirm with the employee whether the employer has IN nexus; if not, route to Tax & Withholding."], "Shared rules", { audience: "External", views: 188, likes: 11 }),
  KA("KA-01093", "State withholding forms by state (2026)", "Each state's withholding certificate and whether the federal W-4 is accepted.", ["IL – IL-W-4", "IN – WH-4", "OH – IT 4", "NJ – NJ-W4", "WA – no state income tax"], "Shared rules"),
  KA("KA-01101", "Final pay timing rules by state", "Final pay deadlines differ by state: California same day for involuntary termination, Illinois next scheduled payday, Ohio within 15 days or next payday.", ["CA – immediately on involuntary termination; 72 hours if the employee resigns without notice.", "IL – next regular payday.", "OH – earlier of next payday or 15 days."], "Shared rules"),
  KA("KA-01110", "Correcting a duplicated garnishment deduction", "A garnishment deducted twice is usually an amended order keyed as a new order. Refund the duplicate on the next pay, end-date the duplicate order and confirm the agency was not over-remitted.", ["Compare the two deduction lines: same order reference means a duplicate order, not a second order.", "End-date the duplicate order with effective date = the pay period it first deducted.", "Refund the duplicate amount on the next regular pay as a non-taxable adjustment.", "Check remittance: if the agency received the duplicate, request a credit on the next remittance."], "Shared rules", { likes: 7, views: 76, modified: d(3) }),
  KA("KA-01112", "Garnishment limits under the CCPA", "Ordinary garnishments are limited to 25% of disposable earnings; child-support orders up to 50–65% depending on dependants and arrears.", ["Ordinary creditor: lesser of 25% of disposable earnings or amount above 30 × federal minimum wage.", "Child support: 50% (supporting another family) / 60% (not), +5% if more than 12 weeks in arrears."], "Shared rules"),
  KA("KA-01120", "Benefits, FSA and 401(k) questions – route to Alight", "Strada handles payroll only. Benefits enrolment, FSA reimbursements and 401(k) questions remained with Alight after the 2024 separation.", ["Confirm the question is about benefits, not a payroll deduction.", "Transfer to the Misroute – Alight Benefits queue with the employee's details.", "Give the employee the Alight contact line."], "Shared rules", { audience: "External", views: 410 }),
  KA("KA-01131", "Cascade Foods – weekly plant pay group WK-PLANT", "Weekly pay group paid Thursday; time import from Kronos closes Tuesday 6 PM PT.", ["Pay date Thursday.", "Kronos import closes Tuesday 6 PM PT; late approvals go to the next week."], "Cascade Foods KB"),
  KA("KA-01140", "Northbridge Retail Group – store pay group BW-STORE", "Bi-weekly store group; many employees across IL/IN/WI with multi-state withholding.", ["Stores in IL, IN and WI.", "Reciprocity: IL–WI, IN–WI; no IL–IN reciprocity."], "Northbridge Retail Group KB"),
];

const C = (c: Partial<Case> & Pick<Case, "id" | "number" | "title" | "customerId" | "accountId" | "subject" | "priority" | "status" | "origin" | "queueId" | "createdOn" | "intent" | "summary" | "highlights">): Case => ({
  type: "Problem", product: "US Payroll – Direct Deposit", description: "", owner: OWNER, modifiedOn: c.createdOn, escalated: false, firstResponseSent: true, articleIds: [], ...c,
});

export const cases: Case[] = [
  C({ id: "k1", number: "CAS-10492-R03M8", title: "Pay not received – direct deposit returned (R03)", customerId: "c1", accountId: "a2", subject: "Pay distribution", priority: "High", status: "In Progress", origin: "Chat", queueId: "q1", createdOn: minsAgo(52), modifiedOn: minsAgo(9),
    description: "Employee reports nothing hit her account on pay date. ACH return report shows R03 for MHP-20417, amount 2,184.37. Account number on file ends 4471; employee states her account ends 4417.",
    intent: "Pay not received – bank return", scriptId: "s1", articleIds: ["KA-01041", "KA-01052"], aiCreated: true, aiFields: ["title", "subject", "priority", "product", "description"], parentId: "k2",
    product: "US Payroll – Direct Deposit", firstResponseBy: ahead(0, 13), resolveBy: ahead(1, 17), followUpBy: ahead(0, 16),
    summary: "Dana Whitfield (Meridian Health Partners, pay group BW-NUR) reported that her direct deposit for the current pay date did not arrive. The ACH return report shows return code R03 (no account / unable to locate) for her deposit of 2,184.37. The account number on file ends 4471 while she confirms her account ends 4417, indicating a transposed digit entered during onboarding. She was offered a live check by same-day courier or a re-deposit once corrected details are saved in Strada Pay, and chose the live check. The case is linked to parent incident CAS-10490 because three other BW-NUR employees reported the same issue within the hour.",
    highlights: ["Direct deposit of 2,184.37 returned with code R03; account number on file ends 4471, employee's ends 4417.", "Employee chose a live check by same-day courier; courier cut-off is 2 PM ET.", "Case linked as a child of incident CAS-10490 (BW-NUR cluster) by the Case Management Agent.", "Follow-up due today at 4 PM to confirm delivery and corrected bank details."] }),
  C({ id: "k2", number: "CAS-10490-INC07", title: "Incident: multiple BW-NUR bank returns on current pay date", customerId: "c11", accountId: "a2", subject: "Pay distribution", priority: "High", status: "In Progress", origin: "Chat", queueId: "q1", createdOn: minsAgo(41), modifiedOn: minsAgo(6),
    description: "Four employees in Meridian Health Partners pay group BW-NUR reported missing deposits within 60 minutes. Treasury confirms 4 R03 returns on the ACH file released T-2. Root cause under investigation by Tier 3: suspected bank-details import from the Workday feed on 10/02 overwrote account numbers for records with leading zeros.",
    intent: "Pay group incident", scriptId: "s2", type: "Problem", escalated: true, escalatedOn: minsAgo(30), articleIds: ["KA-01073", "KA-01060"], aiUpdated: true, aiFields: ["type", "escalated", "description"],
    product: "US Payroll – ACH File", firstResponseBy: minsAgo(20), resolveBy: ahead(0, 17), followUpBy: ahead(0, 12),
    summary: "Four Meridian Health Partners employees in pay group BW-NUR reported missing direct deposits for the current pay date within one hour. The Case Management Agent clustered the four employee cases under this incident and set Type = Problem, Escalated = Yes. Treasury has confirmed four R03 returns on the ACH file released two days before pay date. Tier 3 suspects the Workday bank-details import on 10/02 dropped leading zeros from account numbers. Client payroll lead Rachel Moreno has been notified with a 60-minute update commitment; a client update call is scheduled for 12:00.",
    highlights: ["4 employee cases (Whitfield, Ortega, Brown, Reilly) linked as child cases within 60 minutes.", "Treasury confirmed 4 R03 returns on the BW-NUR ACH file.", "Suspected root cause: Workday bank-details import on 10/02 dropped leading zeros.", "Client payroll lead notified; update call at 12:00; Resolve By 5 PM today."] }),
  C({ id: "k3", number: "CAS-10493-R03N1", title: "Pay not received – direct deposit returned (R03)", customerId: "c2", accountId: "a2", subject: "Pay distribution", priority: "High", status: "In Progress", origin: "Chat", queueId: "q1", createdOn: minsAgo(47), modifiedOn: minsAgo(47), parentId: "k2", intent: "Pay not received – bank return", scriptId: "s1", articleIds: ["KA-01041"], aiCreated: true, aiFields: ["title", "subject", "priority", "description"],
    description: "Employee reports missing deposit on pay date. R03 return confirmed for MHP-20988, amount 1,962.10.", resolveBy: ahead(1, 17),
    summary: "Luis Ortega (Meridian Health Partners, BW-NUR) reported a missing direct deposit of 1,962.10 on the current pay date. The ACH return report shows R03. The case was created by the Case Management Agent from the chat and linked to incident CAS-10490.", highlights: ["R03 return confirmed for 1,962.10.", "Linked to incident CAS-10490.", "Awaiting root-cause confirmation before offering a remedy."] }),
  C({ id: "k4", number: "CAS-10494-R03P4", title: "Pay not received – direct deposit returned (R03)", customerId: "c3", accountId: "a2", subject: "Pay distribution", priority: "High", status: "In Progress", origin: "Chat", queueId: "q1", createdOn: minsAgo(44), modifiedOn: minsAgo(44), parentId: "k2", intent: "Pay not received – bank return", scriptId: "s1", articleIds: ["KA-01041"], aiCreated: true, aiFields: ["title", "subject", "priority", "description"],
    description: "Employee reports missing deposit on pay date. R03 return confirmed for MHP-21102, amount 2,310.55.", resolveBy: ahead(1, 17),
    summary: "Keisha Brown (Meridian Health Partners, BW-NUR) reported a missing direct deposit of 2,310.55. R03 return confirmed. Case created from chat by the Case Management Agent and linked to incident CAS-10490.", highlights: ["R03 return confirmed for 2,310.55.", "Linked to incident CAS-10490."] }),
  C({ id: "k5", number: "CAS-10495-R03Q9", title: "Pay not received – direct deposit returned (R03)", customerId: "c4", accountId: "a2", subject: "Pay distribution", priority: "High", status: "In Progress", origin: "Phone", queueId: "q1", createdOn: minsAgo(38), modifiedOn: minsAgo(38), parentId: "k2", intent: "Pay not received – bank return", scriptId: "s1", articleIds: ["KA-01041"], aiCreated: true, aiFields: ["title", "subject", "priority", "description"],
    description: "Employee called about a missing deposit. R03 return confirmed for MHP-19876, amount 1,744.90.", resolveBy: ahead(1, 17),
    summary: "Tom Reilly (Meridian Health Partners, BW-NUR) called about a missing direct deposit of 1,744.90. R03 return confirmed. Case created from the voice conversation by the Case Management Agent and linked to incident CAS-10490.", highlights: ["R03 return confirmed for 1,744.90.", "Linked to incident CAS-10490."] }),
  C({ id: "k6", number: "CAS-10471-W2R2A", title: "Request copy of 2025 W-2", customerId: "c5", accountId: "a1", subject: "Employee documents", priority: "Low", status: "Resolved", origin: "Email", queueId: "q5", createdOn: d(1, 9, 12), modifiedOn: d(1, 9, 31), type: "Request", product: "US Payroll – Tax Documents", intent: "Document request", scriptId: "s3", articleIds: ["KA-01081", "KA-01085"], aiCreated: true, aiUpdated: true, aiFields: ["title", "subject", "type", "priority", "product"],
    description: "Employee emailed asking for a copy of her 2025 W-2 for a mortgage application. Identity confirmed from the email address on file and SSN last four in the Strada Pay profile.", firstResponseBy: d(1, 13), resolveBy: d(0, 9),
    summary: "Anita Desai (Harbor Point Logistics) emailed requesting a copy of her 2025 W-2 for a mortgage application. The Case Management Agent created the case from the email and classified it as a document request. Identity was confirmed against the profile on file, the W-2 was reissued to the Strada Pay document centre and a reply email was sent with download instructions. The case was resolved autonomously 19 minutes after the email arrived with no representative action.",
    highlights: ["Case created from inbound email by the Case Management Agent.", "2025 W-2 reissued to the document centre; reply email sent with download steps.", "Resolved autonomously in 19 minutes; no representative action required."] }),
  C({ id: "k7", number: "CAS-10478-WH4IN", title: "Moved from Illinois to Indiana – state withholding not updated", customerId: "c6", accountId: "a3", subject: "Tax & withholding", priority: "Normal", status: "Waiting for Details", origin: "Web", queueId: "q3", createdOn: d(2, 14, 5), modifiedOn: d(0, 9, 40), type: "Question", product: "US Payroll – State Tax", intent: "Tax withholding change", scriptId: "s4", articleIds: ["KA-01092", "KA-01093", "KA-01140"], aiUpdated: true, aiFields: ["subject", "type", "product"],
    description: "Employee moved from Chicago, IL to Carmel, IN on 09/28. Last pay still withheld Illinois tax. Employee asks what forms are needed and whether Indiana county tax applies this year.", followUpBy: ahead(2, 10), firstResponseBy: d(2, 18), resolveBy: ahead(5, 17),
    summary: "Marcus Hill (Northbridge Retail Group, SM-HQ) moved from Illinois to Indiana on 09/28 and his most recent pay still withheld Illinois state tax. The Customer Intent Agent identified the intent as a mid-year state withholding change. He was told that Indiana requires form WH-4 and that Illinois withholding ends the day before the move; Indiana county tax is based on county of residence on 1 January, so it applies from next year. The WH-4 has not yet been submitted in Strada Pay. The Case Management Agent scheduled two follow-ups; the first is due in two days, after which the case closes automatically if the form is on file.",
    highlights: ["Moved IL → IN on 09/28; IL withholding still applied on the last pay.", "Needs Indiana WH-4; IL-W-4 end-dated 09/27. County tax applies from next year.", "Two automated follow-ups scheduled; auto-close when WH-4 is on file.", "Article KA-01092 linked to the case."] }),
  C({ id: "k8", number: "CAS-10483-GRN2X", title: "Child-support garnishment deducted twice on 10/10 pay", customerId: "c7", accountId: "a4", subject: "Garnishments & deductions", priority: "High", status: "Researching", origin: "Phone", queueId: "q4", createdOn: d(3, 11, 20), modifiedOn: d(0, 8, 55), type: "Problem", product: "US Payroll – Garnishments", intent: "Garnishment deducted twice", scriptId: "s5", articleIds: ["KA-01110", "KA-01112"],
    description: "Employee's 10/10 pay statement shows two deductions of 312.00 for child-support order WA-CS-77821. Amended order received 10/01 was keyed as a new order instead of replacing the original.", firstResponseBy: d(3, 15), followUpBy: ahead(0, 15), resolveBy: ahead(1, 17),
    summary: "Elena Petrova (Cascade Foods, WK-PLANT) called because her 10/10 pay statement shows two child-support deductions of 312.00 for the same order WA-CS-77821. Research shows the amended order received on 10/01 was keyed as a new order instead of replacing the original, so both deducted. The remedy is to end-date the duplicate order, refund 312.00 on the next weekly pay as a non-taxable adjustment and confirm with the Washington DCS that only one remittance was sent. The refund is approved; the remittance check with the agency is outstanding.",
    highlights: ["Two deductions of 312.00 for order WA-CS-77821 on the 10/10 pay.", "Cause: amended order keyed as a new order on 10/01.", "Refund of 312.00 approved for the next weekly pay; duplicate order end-dated.", "Outstanding: confirm single remittance with Washington DCS."] }),
  C({ id: "k9", number: "CAS-10466-FSA01", title: "FSA reimbursement not received", customerId: "c8", accountId: "a1", subject: "Benefits – misroute", priority: "Low", status: "On Hold", origin: "Chat", queueId: "q6", createdOn: d(4, 16, 2), modifiedOn: d(4, 16, 20), type: "Question", product: "Benefits (Alight)", intent: "Benefits misroute", articleIds: ["KA-01120"],
    description: "Employee asked about an FSA reimbursement. FSA administration sits with Alight; transferred with employee details.", resolveBy: ahead(3, 17),
    summary: "Jordan Lee (Harbor Point Logistics) asked why an FSA reimbursement had not arrived. FSA administration is handled by Alight, not Strada Payroll. The case was transferred to the Misroute – Alight Benefits queue with the employee's details and the employee was given the Alight contact line.", highlights: ["Benefits question, not payroll; transferred to Alight.", "Employee given the Alight contact line."] }),
  C({ id: "k10", number: "CAS-10461-FPIL1", title: "Final pay for terminated store associate – timing", customerId: "c9", accountId: "a3", subject: "Ongoing processing", priority: "Normal", status: "In Progress", origin: "Email", queueId: "q2", createdOn: d(5, 10, 30), modifiedOn: d(1, 14, 10), type: "Question", product: "US Payroll – Off-cycle", intent: "Final pay timing", articleIds: ["KA-01101"],
    description: "Store manager asks when the final pay for an associate terminated 10/13 must be issued under Illinois rules.", resolveBy: ahead(1, 17),
    summary: "Samuel Okafor (Northbridge Retail Group, BW-STORE) emailed asking when final pay is due for an associate terminated on 10/13. Under Illinois rules final pay is due by the next regular payday, which is 10/24 for BW-STORE. An off-cycle check is not required unless the client requests it.", highlights: ["Illinois: final pay due by next regular payday (10/24).", "Off-cycle only if the client requests it."] }),
  C({ id: "k11", number: "CAS-10455-TIME3", title: "Kronos hours import rejected – 14 employees", customerId: "c10", accountId: "a4", subject: "Ongoing processing", priority: "Normal", status: "In Progress", origin: "Email", queueId: "q2", createdOn: d(6, 8, 15), modifiedOn: d(2, 9, 0), type: "Problem", product: "US Payroll – Time Import", intent: "Time import failure", articleIds: ["KA-01131"],
    description: "Weekly Kronos import for WK-PLANT rejected 14 records with unapproved time. Client payroll contact asked to approve before the Tuesday 6 PM cut-off.", resolveBy: ahead(0, 18),
    summary: "Grace Kim (Cascade Foods) reported that the weekly Kronos import for WK-PLANT rejected 14 records because time was unapproved. The client was asked to approve the records before the Tuesday 6 PM PT cut-off so they are included in Thursday's pay.", highlights: ["14 records rejected: unapproved time.", "Client to approve before Tuesday 6 PM PT."] }),
  C({ id: "k12", number: "CAS-10449-ADDR9", title: "Address change not reflected on pay statement", customerId: "c12", accountId: "a1", subject: "Employee data", priority: "Low", status: "In Progress", origin: "Web", queueId: "q2", createdOn: d(8, 13, 45), modifiedOn: d(7, 9, 0), type: "Request", product: "US Payroll – Employee Data", intent: "Employee data change", articleIds: [],
    description: "Employee updated his address in Workday on 10/05 but the pay statement still shows the old address.", resolveBy: ahead(2, 17),
    summary: "Victor Nguyen (Harbor Point Logistics, BW-OPS) updated his address in Workday on 10/05 but his pay statement still shows the old address. The Workday integration runs nightly; the change was confirmed in Strada Pay on 10/07 and will appear on the next statement.", highlights: ["Address updated in Workday 10/05; synced to Strada Pay 10/07.", "Next pay statement will show the new address."] }),
];

const A = (a: Partial<Activity> & Pick<Activity, "id" | "caseId" | "type" | "from" | "subject" | "at">): Activity => ({ modifiedAt: a.at, ...a });

export const activities: Activity[] = [
  // k1 – Dana Whitfield
  A({ id: "t1", caseId: "k1", type: "chat", from: "Dana Whitfield", subject: "Nothing hit my account", at: minsAgo(52), status: "Closed", transcript: [
    { who: "Dana Whitfield", text: "Hi, it's pay day and nothing has hit my account. My colleagues got paid.", at: "9:38 AM" },
    { who: "Strada Pay assistant", text: "I'm sorry to hear that, Dana. I've verified your identity from the code we sent to your phone. Let me check the status of your deposit.", at: "9:38 AM" },
    { who: "Strada Pay assistant", text: "Your deposit of $2,184.37 was returned by your bank with code R03, which means the bank could not locate the account. The account number on file ends in 4471. Does that match your account?", at: "9:39 AM" },
    { who: "Dana Whitfield", text: "No! My account ends in 4417. Someone must have typed it wrong.", at: "9:39 AM" },
    { who: "Strada Pay assistant", text: "Thank you. I can issue a live check by same-day courier to the Meridian Health Partners site, or re-send the deposit once you correct the account number in Strada Pay. Which would you prefer?", at: "9:40 AM" },
    { who: "Dana Whitfield", text: "Live check please, I need the money today.", at: "9:40 AM" },
    { who: "Strada Pay assistant", text: "Done. A live check for $2,184.37 will be couriered today; you'll get a text when it's dispatched. I've created case CAS-10492 and a payroll specialist will follow up this afternoon.", at: "9:41 AM" },
  ] }),
  A({ id: "t2", caseId: "k1", type: "note", from: "Case Management Agent", subject: "Conversation summary", at: minsAgo(50), aiGenerated: true, body: "Employee reported missing deposit on pay date. R03 return confirmed for $2,184.37. Account number on file ends 4471; employee confirms 4417. Employee chose live check by same-day courier. Case fields populated from the conversation." }),
  A({ id: "t3", caseId: "k1", type: "autopost", from: "Case Management Agent", subject: "Case linked to parent CAS-10490", at: minsAgo(35), aiGenerated: true, body: "Three further R03 returns detected in pay group BW-NUR within 60 minutes. This case was linked as a child of incident CAS-10490." }),
  A({ id: "t4", caseId: "k1", type: "task", from: OWNER, subject: "Confirm live check dispatched and corrected bank details saved", at: minsAgo(9), status: "Open", due: ahead(0, 16) }),
  A({ id: "t5", caseId: "k1", type: "email", direction: "out", from: OWNER, subject: "Your pay for today – live check on its way", at: minsAgo(9), body: "Hi Dana, confirming that a live check for $2,184.37 is being couriered to the Meridian Health Partners site today. Please update your account number in Strada Pay › Pay › Direct deposit so future deposits go through. — Priya, Strada Payroll Support" }),
  // k2 – incident
  A({ id: "t6", caseId: "k2", type: "autopost", from: "Case Management Agent", subject: "Incident created from 4 related cases", at: minsAgo(41), aiGenerated: true, body: "Four cases with intent 'Pay not received – bank return' in pay group BW-NUR within 60 minutes. Parent case created; Type = Problem, Escalated = Yes." }),
  A({ id: "t7", caseId: "k2", type: "email", direction: "out", from: OWNER, subject: "BW-NUR direct deposit returns – initial notification", at: minsAgo(30), body: "Hi Rachel, we have identified ACH returns affecting 4 employees in BW-NUR for today's pay date. Treasury has confirmed the returns and Tier 3 is investigating the bank-details feed from 10/02. Root cause and remediation ETA within 60 minutes. Affected employees are being contacted directly and offered live checks. — Priya" }),
  A({ id: "t8", caseId: "k2", type: "call", from: "Rachel Moreno", subject: "Acknowledged notification; asked for list of affected employees", at: minsAgo(22), status: "Closed", body: "Rachel acknowledged. Asked for the list of affected employees and confirmation that no other pay groups are affected. Confirmed BW-ADM file clean." }),
  A({ id: "t9", caseId: "k2", type: "appointment", from: OWNER, subject: "Client update call – BW-NUR incident", at: ahead(0, 12), status: "Open", due: ahead(0, 12, 30) }),
  A({ id: "t10", caseId: "k2", type: "note", from: "Tier 3 – Ravi Menon", subject: "Root cause update", at: minsAgo(6), body: "Workday bank-details import on 10/02 dropped leading zeros on 4 account numbers (all starting 0). Fix: re-import with string typing; corrected details to Treasury for re-deposit on Monday. Live checks today for all 4." }),
  // k3, k4, k5 children
  A({ id: "t11", caseId: "k3", type: "chat", from: "Luis Ortega", subject: "Missing pay today", at: minsAgo(47), status: "Closed", transcript: [
    { who: "Luis Ortega", text: "My pay didn't come in today.", at: "9:43 AM" },
    { who: "Strada Pay assistant", text: "I'm sorry, Luis. Your deposit of $1,962.10 was returned with code R03. A specialist is looking into a wider issue affecting your pay group and will contact you within the hour.", at: "9:44 AM" },
  ] }),
  A({ id: "t12", caseId: "k3", type: "note", from: "Case Management Agent", subject: "Conversation summary", at: minsAgo(46), aiGenerated: true, body: "R03 return confirmed for $1,962.10. Linked to incident CAS-10490." }),
  A({ id: "t13", caseId: "k4", type: "chat", from: "Keisha Brown", subject: "No deposit", at: minsAgo(44), status: "Closed", transcript: [ { who: "Keisha Brown", text: "Hello, I haven't been paid.", at: "9:46 AM" }, { who: "Strada Pay assistant", text: "I'm sorry, Keisha. Your deposit of $2,310.55 was returned by the bank (R03). This is affecting several colleagues and a specialist will be in touch within the hour.", at: "9:47 AM" } ] }),
  A({ id: "t14", caseId: "k5", type: "call", from: "Tom Reilly", subject: "Called about missing deposit", at: minsAgo(38), status: "Closed", body: "Voice agent verified identity; R03 return confirmed for $1,744.90; employee informed of incident and live check option." }),
  // k6 – W-2 autonomous
  A({ id: "t15", caseId: "k6", type: "email", direction: "in", from: "Anita Desai", subject: "Copy of my 2025 W-2", at: d(1, 9, 12), body: "Hello, I need a copy of my 2025 W-2 for a mortgage application. Could you send it or tell me where to download it? Thanks, Anita Desai (HPL-30544)" }),
  A({ id: "t16", caseId: "k6", type: "autopost", from: "Case Management Agent", subject: "Case created from email", at: d(1, 9, 13), aiGenerated: true, body: "Case created from inbound email. Intent: Document request. Fields populated: Title, Subject, Type, Priority, Product." }),
  A({ id: "t17", caseId: "k6", type: "note", from: "Case Management Agent", subject: "Identity confirmed; W-2 reissued", at: d(1, 9, 20), aiGenerated: true, body: "Email address matches profile on file. SSN last four verified against profile. 2025 W-2 reissued to the Strada Pay document centre (available within 15 minutes)." }),
  A({ id: "t18", caseId: "k6", type: "email", direction: "out", from: "Strada Payroll Support", subject: "RE: Copy of my 2025 W-2", at: d(1, 9, 26), aiGenerated: true, body: "Hi Anita, your 2025 W-2 has been reissued and is available to download from Strada Pay › Documents › Tax forms. It will appear within 15 minutes. If you need a paper copy mailed to your address on file, reply to this email. — Strada Payroll Support" }),
  A({ id: "t19", caseId: "k6", type: "autopost", from: "Case Management Agent", subject: "Case resolved", at: d(1, 9, 31), aiGenerated: true, body: "Resolution: W-2 reissued; reply sent. Resolved autonomously." }),
  // k7 – state move
  A({ id: "t20", caseId: "k7", type: "email", direction: "in", from: "Marcus Hill", subject: "Moved to Indiana – still paying Illinois tax", at: d(2, 14, 5), body: "Hi, I moved from Chicago to Carmel, IN on Sept 28 and updated my address, but my last paycheck still took Illinois state tax. What do I need to do? Does Indiana county tax apply now?" }),
  A({ id: "t21", caseId: "k7", type: "autopost", from: "Customer Intent Agent", subject: "Intent identified: Tax withholding change (state move)", at: d(2, 14, 6), aiGenerated: true, body: "Recommended article: KA-01092 Mid-year state move: Illinois to Indiana withholding (WH-4)." }),
  A({ id: "t22", caseId: "k7", type: "email", direction: "out", from: OWNER, subject: "RE: Moved to Indiana – still paying Illinois tax", at: d(2, 16, 40), body: "Hi Marcus, thanks for letting us know. Indiana requires form WH-4 for state and county withholding; Illinois withholding will be end-dated 09/27. Please submit the WH-4 in Strada Pay › Tax › State withholding. Indiana county tax is based on your county of residence on 1 January, so it applies from next year. We'll check back in a few days to confirm the form is on file. — Priya" }),
  A({ id: "t23", caseId: "k7", type: "task", from: "Case Management Agent", subject: "Follow-up 1: confirm WH-4 submitted", at: d(0, 9, 40), status: "Open", due: ahead(2, 10), aiGenerated: true }),
  A({ id: "t24", caseId: "k7", type: "task", from: "Case Management Agent", subject: "Follow-up 2: auto-close if WH-4 on file", at: d(0, 9, 40), status: "Open", due: ahead(5, 10), aiGenerated: true }),
  // k8 – garnishment
  A({ id: "t25", caseId: "k8", type: "call", from: "Elena Petrova", subject: "Two child-support deductions on my pay", at: d(3, 11, 20), status: "Closed", body: "Employee reports two deductions of $312.00 on the 10/10 statement for order WA-CS-77821. Verified identity. Advised research needed; promised update within 2 business days." }),
  A({ id: "t26", caseId: "k8", type: "note", from: OWNER, subject: "Research: duplicate order", at: d(2, 15, 0), body: "Amended order received 10/01 was keyed as a new order (GRN-2291-B) instead of replacing GRN-2291. Both active on 10/10. Remittance file shows two lines to WA DCS — need to confirm whether both were sent." }),
  A({ id: "t27", caseId: "k8", type: "appointment", from: OWNER, subject: "Call Elena with resolution", at: d(1, 15, 0), status: "Overdue", due: d(1, 15, 30) }),
  A({ id: "t28", caseId: "k8", type: "task", from: OWNER, subject: "Confirm single remittance with Washington DCS", at: d(0, 8, 55), status: "Open", due: ahead(0, 15) }),
  // others
  A({ id: "t29", caseId: "k9", type: "chat", from: "Jordan Lee", subject: "FSA reimbursement", at: d(4, 16, 2), status: "Closed", transcript: [ { who: "Jordan Lee", text: "My FSA reimbursement hasn't arrived.", at: "4:02 PM" }, { who: "Strada Pay assistant", text: "FSA reimbursements are handled by Alight. I've passed your details to them and you can reach them on the Alight benefits line.", at: "4:03 PM" } ] }),
  A({ id: "t30", caseId: "k10", type: "email", direction: "in", from: "Samuel Okafor", subject: "Final pay for terminated associate", at: d(5, 10, 30), body: "When does the final pay need to go out for an associate terminated 10/13 (IL store)?" }),
  A({ id: "t31", caseId: "k10", type: "email", direction: "out", from: OWNER, subject: "RE: Final pay for terminated associate", at: d(1, 14, 10), body: "Hi Samuel, under Illinois rules final pay is due by the next regular payday, 10/24 for BW-STORE. We can run an off-cycle check earlier if you'd like. — Priya" }),
  A({ id: "t32", caseId: "k11", type: "email", direction: "in", from: "Grace Kim", subject: "Kronos import rejected 14 records", at: d(6, 8, 15), body: "The WK-PLANT import rejected 14 records. Can you tell me which ones?" }),
  A({ id: "t33", caseId: "k11", type: "task", from: OWNER, subject: "Confirm 14 records approved before Tuesday cut-off", at: d(2, 9, 0), status: "Open", due: ahead(0, 18) }),
  A({ id: "t34", caseId: "k12", type: "note", from: OWNER, subject: "Workday sync confirmed", at: d(7, 9, 0), body: "Address change synced 10/07. Will show on next statement." }),
];

export const queueItems = [
  { caseId: "k3", enteredQueue: minsAgo(47), workedBy: "" },
  { caseId: "k4", enteredQueue: minsAgo(44), workedBy: "" },
  { caseId: "k5", enteredQueue: minsAgo(38), workedBy: "" },
  { caseId: "k11", enteredQueue: d(6, 8, 16), workedBy: OWNER },
  { caseId: "k10", enteredQueue: d(5, 10, 31), workedBy: OWNER },
  { caseId: "k12", enteredQueue: d(8, 13, 46), workedBy: "" },
  { caseId: "k9", enteredQueue: d(4, 16, 3), workedBy: "" },
  { caseId: "k7", enteredQueue: d(2, 14, 6), workedBy: OWNER },
];
