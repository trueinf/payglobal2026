# Use-case stories — what each agent does, step by step, and how to show it

One section per agent. Each story is written the way it runs in the prototype today: the trigger, what the agent reads, what it writes, what each person sees. Items marked **[gap]** are not built yet. Use this document for the use-case walkthrough once all agents exist.

Presenter controls (workspace, not product UI): `Ctrl/Cmd+Shift+D` opens the demo feeds (bank return file, timesheet cut-off, clock); `Ctrl/Cmd+Shift+I` re-arms the seeded incoming voice call. "Reset the day" reseeds everything and zeroes the clock.

---

## Strada Pay assistant (employee-facing, chat + voice) — phase 1

**Trigger** The employee opens Strada Pay and chats, or calls Strada Payroll Support (ElevenLabs voice agent, Claude as its LLM, same six tools).

**Story** Tom Reilly (Meridian Health Partners, BW-NUR) says his pay didn't arrive → the assistant verifies him (SSN‑4 or phone code) → `get_payment_status` finds the R03 return and the open case → explains the money is safe and offers two remedies → Tom asks for a person → `transfer_to_representative` → the conversation enters the Pay Distribution queue with the transcript and the case attached.

**What people see** Employee: the conversation in Strada Pay, then "waiting for a payroll specialist". Supervisor: the live row on the Omnichannel dashboard; Monitor shows the transcript, the assistant's tool calls and the Next Best Action card. Representative: the incoming notification, Accept, Communication panel + Active Conversation form, Copilot *Suggest a response*, End → Wrap-up (Case Management Agent updates the case from the transcript) → disposition → close.

**Evidence** `agent_runs` rows for "Strada Pay assistant" with the tool calls; the case timeline (chat/call activity with transcript, wrap-up note).

---

## Case Management Agent (Microsoft) — phase 0

**Trigger** Any inbound contact (chat, voice, email intake) and conversation wrap-up.

**Story** Reads the message plus Strada People and payment status → predicts title, subject, priority, type, product, description with Claude → creates the case with the AI toolbar and *Accept suggestions* → on wrap-up appends to the description, rewrites the summary and may change status.

---

## Customer Knowledge Management Agent (Microsoft) — phase 0

**Trigger** A case is resolved.

**Story** Drafts a knowledge article into the client KB from the resolution, marked *Draft from case*; the representative reviews and publishes it in Knowledge search.

---

## Next Best Action Agent — phase 1

**Trigger** Every employee turn in a live conversation (assistant- or representative-handled).

**Story** Reads transcript, tool results and the case → stage, next best action with rationale, risk, and whether a human should take over (with a suggested opening line). Shown on the Monitor view and to the representative once accepted; "Take-over recommended" also flags the Omnichannel row.

---

## Pay Event Sentinel — phase 2

**Trigger** Events from the bank and the time system: `ach.return_posted`, `timesheet.unapproved_at_cutoff`. (Demo feed: "Bank return file lands – Harbor Point BW-OPS", "Timesheet cut-off – Cascade Foods WK-PLANT".)

**Story (bank return)** 06:12 on pay day the return file lands with four R04s for Harbor Point BW-OPS. For each employee the Sentinel reads Strada People, checks for an open case, writes the employee message and case description with Claude, **opens the case before the employee knows** (origin Web, *Pay Event Sentinel opened this case from the pay-event feed*), sends the SMS/app notification ("your money is safe, a case is open, you don't need to change anything yet") and posts both to the timeline. Within a minute four cases sit in Pay Distribution and four employees have been told.

**Story (timesheet cut-off)** At cut-off 14 WK-PLANT timesheets (612 h) are unapproved. The Sentinel reads the pay calendar, opens an Ongoing Processing case on the client payroll contact (Grace Kim), lists the 14 employees on the timeline and warns Grace and the manager (Dale Hoffman) by email/app — before the import fails and before any employee is underpaid.

**What people see** Workspace: *Payroll Prevention Dashboard* → KPI "Employees told before they called", the *Pay events handled* grid, toasts as each run completes; the cases in My work items. Strada Pay: the notification on the employee's home (Jordan Lee, Maria Santos, Derek Cole, Victor Nguyen).

---

## Incident Clustering Agent — phase 2

**Trigger** `case.created` for a clusterable intent (bank return) — three or more open cases for the same client pay group within six hours.

**Story** When the third BW-OPS case lands, the agent pulls bank details and payment status for the affected employees and for the unaffected ones in the same pay group → Claude names the common cause with evidence ("all four returned accounts use routing 021200339; different account numbers; unaffected employees on other routings were paid → bank-side change, not employee error", High confidence) → opens the incident case on the client payroll lead (Nina Patel), escalated, with summary, root cause and an action plan → links each employee case as a child (timeline note "Linked to incident …") → notifies the client lead **once**. The fourth case attaches to the same incident and updates the count.

**What people see** Prevention dashboard *Incidents* grid (cases, cause, confidence, client notified); the incident case with the Incident card (root cause, plan, linked cases); each child case with the link note; Nina Patel's alert.

**Seeded counterpart** CAS‑10490‑INC07 is the earlier BW-NUR incident (Meridian) told in the seed data; the live one is Harbor Point BW-OPS so the agent is seen working.

---

## Day-7 Resolution Verifier — phase 2

**Trigger** `case.resolved` for a bank-return case (records the remedy with Strada payments and schedules an agent-owned Day‑7 task on the timeline); `clock.advanced` (demo feed "Advance the clock 7 days") runs the check for every resolved case whose seven days are up.

**Story — settled** Anita Desai's case (seeded, resolved six days ago, redeposit after she corrected her account) → Strada shows paid → *Day-7 verification: payment settled* on the timeline, `verified`, SMS/app "nothing more is needed from you".

**Story — on track** A redeposit arranged today settles on the next pay run (after day 7) → "on track", the task moves to the expected date, employee gets a status update, case stays resolved.

**Story — reopened** A representative resolves with "redeposit scheduled" but the employee never corrected the account → on the expected date the redeposit bounces again → the case is reopened at High priority, escalated, *Day-7 Resolution Verifier reopened this case* banner, employee told a specialist will call. Nobody finds out from a second complaint.

**What people see** Prevention dashboard *Day-7 verifications* grid and KPI; the case's Resolution verification card; the Day‑7 task on the timeline (Open → Completed); the employee notification.

---

## Payslip Variance Explainer — phase 2b

**Trigger** A case with intent *Payslip variance* is created (chat, voice, email), or *Explain payslip variance* from the case command bar.

**Story** Samuel Okafor (Northbridge, BW-STORE) says his net pay is ~$260 lower and he changed nothing. The agent reads his two most recent payslips, diffs them line by line and explains each change with its cause: no overtime this period (expected), taxes down with gross (expected) — and two lines the employee did not ask for: 401(k) 6 % → 8 % and a new $45 parking deduction, flagged **Check**. Case type becomes Problem, summary and highlights are rewritten, a timeline note lists every line, and the reply to the employee is drafted ("Use this reply" puts it into the email draft).

**What people see** The *Payslip comparison* card on the case with Expected/Check per line and the drafted reply; the note on the timeline; toast "a line looks wrong, correction needed". Next step for the representative: *Refer to Strada Assist* → Pay correction.

---

## State & Tax Rules Agent — phase 2b

**Trigger** Cases with intent *Tax withholding change*, *Final pay timing* or *Employee data change* on creation, or *Check state & tax rules* from the command bar.

**Story (move)** Marcus Hill moved IL → IN on 09/28; his last pay still withheld Illinois tax. The agent reads his record (state, previous address, move date, withholding on file) and the IL and IN rule reference → determination: Indiana withholding from the move date, form WH‑4 (Indiana does not accept the federal W‑4), Illinois ends the day before; Hamilton County tax does **not** apply in 2026 because county of residence on 1 January sets the year — it starts 2027. Actions by owner (employee: submit WH‑4; payroll: end-date IL, correct the 10/16 pay), follow-up tasks on the timeline, status → Waiting for Details, reply drafted.

**Story (final pay)** A store manager asks when a terminated associate's final pay is due. The agent applies the Illinois rule from the reference with the BW‑STORE pay calendar → a date, set as the deadline on the case.

**What people see** The *State & tax rules* card (determination, rules cited, county tax, forms, actions, reply); tasks on the timeline; status and resolve-by updated by the agent.

---

## Complete-Case Referral Agent — phase 2b

**Trigger** *Refer to Strada Assist* on the case (the agent picks the request type from the case, or the representative chooses).

**Story** Elena Petrova's duplicate child-support deduction needs a garnishment dispute at Strada Assist. The agent asks Strada Assist what that request type requires (order reference, deduction history, employee statement), collects the order references from Strada garnishments and the deduction history from the payslips, and finds the employee statement is not on the case — so it **stops**, posts "1 item missing" naming who must supply it, and waits. The representative types the statement into the card and submits; the package goes to Strada Assist complete and comes back with reference SA‑…, posted on the timeline and in the highlights ("complete package, no bounce-back"). For Tom Reilly's bank return the agent infers *Live check* (his bank details are still uncorrected) and finds every item in the systems — ready to submit at once; for a *Re-issue* it would wait for the employee to correct the account in Strada Pay and re-check.

**What people see** The *Referral to Strada Assist* card with the checklist (✓ with source / ✗ with who must supply it), inline fields for the representative's items, Re-check and Submit; the Strada reference once sent; agent run "waiting" while incomplete.

---

## Not yet built **[gap]**

Customer Intent Agent, Quality Evaluation Agent, Identity & Risk (verification only today), Client Insight, Garnishment Order Reader.
