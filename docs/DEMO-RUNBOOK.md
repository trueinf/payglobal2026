# Demo runbook — storyline and actions for every login

Two apps, one shared world. **Copilot Service workspace** (`localhost:5173`) has one login, Priya Natarajan — representative and supervisor. **Strada Pay** (`localhost:5174`) has one login per employee; pick the person whose story you want. Client payroll leads (Rachel Moreno, Nina Patel) do not log in anywhere: their part shows in the workspace (incident cases, alerts, client briefs).

Verification: the assistant asks for the last four of the SSN or the six-digit code; say the SSN digits below, or any six digits for the code.

Presenter controls (workspace): `Ctrl/Cmd+Shift+D` demo feeds (bank return file, timesheet cut-off, advance the clock, reset the day). `Ctrl/Cmd+Shift+I` re-arms the seeded incoming voice call. Reset the day before each run.

---

## Priya Natarajan — Copilot Service workspace

Where every story lands. What she does, by situation:

| Situation | Where | Actions |
| --- | --- | --- |
| Watch an assistant-handled conversation | Home → Omnichannel Ongoing Conversations Dashboard | select the row → **Monitor** → transcript, Next best action, Agent activity; **Take over** if needed |
| Take a transferred conversation | Incoming call/chat card (bottom right) | **Accept** → Communication panel + Active Conversation form; *Suggest a response* → **Send**; **End** → disposition code → close the session (×) |
| Work a case | My work items / dashboard | open the case: AI banner, Accept suggestions, Timeline; ⋮ → *Refer to Strada Assist* / *Explain payslip variance* / *Check state & tax rules* / *Read garnishment order*; **Resolve Case** |
| See what the agents prevented | Home → Payroll Prevention Dashboard | KPIs, Pay events handled, Incidents, Client briefs (*Write*), Customer intents (*Discover*), Day-7 verifications |
| Review a closed conversation | Inbox → Closed work items | Closed Conversation form → Quality evaluation card |
| Client view | Account (open from an incident, a case, or the Client briefs grid) | Client brief card → *Write the brief* |

---

## Strada Pay logins

### Tom Reilly — Meridian Health Partners · BW-NUR · MHP-19876 · SSN 9104
**The headline story: pay day, pay not received.** His deposit of $1,744.90 was returned (R03) this morning; case CAS‑10495 is already open and sits under the BW‑NUR incident.
1. *Call Strada Payroll Support* (or *Chat*). "My pay didn't come in this morning." → verify 9104 → the assistant finds the R03 return, says the money is safe, the case is open, offers re-send after a bank update or a live check through a representative.
2. Workspace: row on the Omnichannel dashboard → Monitor.
3. "I'd rather talk to a person." → transfer → Incoming call → Accept → Suggest a response → Send → Tom: "Can I just get a check today?" → reply: live check by courier today → End → disposition *Bank return – live check issued* → close.
4. Open CAS‑10495: call transcript, wrap-up note. Resolve Case, remarks "Live check issued by courier" → Knowledge Management Agent drafts an article; Day‑7 task appears.
5. Later: advance the clock 7 days → Day‑7 confirms the check settled; Tom's notification.
Variant: "I want to update my bank details" → the assistant takes the new routing/account; Identity & Risk assesses (Tom has no risk signals beyond SSN‑4 → proceed or one-time code) → the change is made and the redeposit scheduled.

### Dana Whitfield · Luis Ortega · Keisha Brown — Meridian · BW-NUR · SSN 3310 / 7742 / 5521
**The other three in the incident.** Each has an open R03 case linked to CAS‑10490‑INC07. Use one of them to show that the assistant already knows: "Where is my money?" → verify → "a case is already open for this; payroll is working on it; the money is safe." No new case is created; the conversation is linked to the existing one. In the workspace the incident case shows all four.
This is also the place to show the out-of-the-box boundary: "a case is already open" comes from D365 (a Copilot Studio agent reading Dataverse could say that alone); "your deposit was returned, code R03, the money is safe" comes from the Strada payroll tools — the part only the Strada-specific first responder can do.

### Jordan Lee · Maria Santos · Derek Cole — Harbor Point Logistics · BW-OPS · SSN 1175 / 3321 / 7745
**Prevention — told before they called.** Do nothing in Strada Pay first. In the workspace: Prevention dashboard → `Ctrl/Cmd+Shift+D` → *Bank return file lands*. Within a minute: four cases opened by the Pay Event Sentinel, four notifications, the incident clustered ("all four share routing 021200339 — bank-side, not employee error"), Nina Patel notified once.
Then sign in as Jordan Lee: the notification is on his home — "your money is safe, a case is open, you don't need to change anything yet." If he chats anyway: the assistant sees the open case.

### Victor Nguyen — Harbor Point · BW-OPS · HPL-31005 · SSN 9930
**Identity & risk.** His address was changed 15 days ago. *Chat*: "I need to change my direct deposit to a new bank." → verify 9930 → give any 9-digit routing and account (e.g. 026009593 / 44881209) → confirm. The Identity & Risk Agent: High risk (recent address change, different institution, SSN‑4 on chat) → **hold**: a representative will call back on the number on file; the assistant offers a transfer; nothing is changed. Workspace: the Identity & risk card on the conversation (Monitor) and on his case, with the signals.

### Anita Desai — Harbor Point · SM-CORP · HPL-30544 · SSN 2208
**Day-7, the settled case.** Her R03 case was resolved six days ago (she corrected her account; redeposit scheduled). Workspace: *Advance the clock 7 days* → Day‑7 Resolution Verifier checks Strada payments → settled → note on CAS‑10458, task completed, notification to Anita. Sign in as Anita to see "Your payment has settled". In chat: "Did my redeposit go through?" → verify → the assistant reads the payment: paid.

### Samuel Okafor — Northbridge Retail Group · BW-STORE · NRG-40777 · SSN 8830
**Payslip variance.** Case CAS‑10497 is open ("net pay lower, I changed nothing"). *Chat*: "My pay is lower this time, what changed?" → verify → the assistant compares the two payslips line by line (no overtime, 401(k) 6→8 %, new $45 parking). Workspace: open the case → the Payslip comparison card (Expected vs **Check**), "Use this reply"; ⋮ → *Refer to Strada Assist* → Pay correction.
He is also the store manager who asked about **final pay** for a terminated associate (CAS‑10461): in the workspace ⋮ → *Check state & tax rules* → Illinois rule + BW‑STORE calendar → dated deadline.

### Marcus Hill — Northbridge · SM-HQ · NRG-41230 · SSN 6617
**State move.** Moved IL → IN on 09/28; case CAS‑10478 open. Workspace: open the case → ⋮ → *Check state & tax rules* → WH‑4 required, Illinois ends the day before the move, Hamilton County tax only from 2027, actions by owner, status Waiting for Details, reply drafted. In Strada Pay: "I moved to Indiana, what do I need to do?" → verify → the assistant opens/links the case; the rules agent runs on it automatically.

### Elena Petrova — Cascade Foods · WK-PLANT · CF-51877 · SSN 4480
**Garnishment deducted twice.** Case CAS‑10483 open. Workspace: ⋮ → *Read garnishment order* → the agent reads the amended DCS order, recognises it as an amendment replacing GRN‑2291, checks the CCPA limit, finds two $312 deductions on 10/21 → end-date the original, refund $312. Then ⋮ → *Refer to Strada Assist* → Garnishment dispute → the package is complete except the employee statement → type it → submit → SA‑reference on the case. In Strada Pay: "Two child-support deductions came out of my pay" → verify → the assistant shows both lines on the payslip and opens/links the case.

### Grace Kim — Cascade Foods · SM-OFFICE · CF-52010 · SSN 0147 (client payroll contact)
**Timesheet cut-off.** Workspace: `Ctrl/Cmd+Shift+D` → *Timesheet cut-off*. The Sentinel opens a case on Grace in Ongoing Processing with the 14 unapproved timesheets and warns her and the manager (Dale Hoffman) before the pay run. Sign in as Grace to see the notification. Her older case CAS‑10455 (Kronos import rejected) is the "what happened last time" contrast.

---

## Suggested order for a 25-minute run
1. Tom Reilly by voice (Acts 1–3) — 8 min.
2. Prevention: bank return file → Jordan Lee's notification → the incident case → Nina Patel's brief (*Write the brief* on Harbor Point) — 6 min.
3. Victor Nguyen's held bank change — 3 min.
4. Samuel Okafor's payslip, Elena's order + referral — 5 min.
5. Advance 7 days: Tom and Anita verified; Closed work items → Tom's call → Quality evaluation — 3 min.
